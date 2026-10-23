// Opt-in Edge smoke test. Uses synthetic pages, an ephemeral loopback server,
// and a disposable profile; no user config, course, account or paid API is read.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {chromium} from 'playwright';
import {createLocalService} from '../wb-service-core.mjs';
import {installBridge} from '../wb-runner-runtime.mjs';

const tempRoot=resolve(tmpdir()),profile=mkdtempSync(join(tempRoot,'wb-lna-smoke-'));
let context,answerCalls=0,scriptRequests=0;
const local=createLocalService({consoleSource:"const LOCAL_TOKEN = '__LOCAL_TOKEN__';",mode:'openai',requestAnswers:async questions=>{answerCalls++;return questions.map(q=>({id:q.id,letters:['A']}));}});
await new Promise((resolve,reject)=>{local.server.once('error',reject);local.server.listen(0,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${local.server.address().port}`;
try{
  context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,viewport:{width:760,height:520},args:['--no-first-run','--no-default-browser-check']});
  const version=context.browser().version();assert.ok(Number.parseInt(version,10)>=145,'This permission smoke test requires Edge >=145.');
  await context.route('https://**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic local-network test</title><p>No real course or account is used.</p>'+(route.request().url().endsWith('/synthetic-child')?'':'<iframe src="https://mooc2-ans.chaoxing.com/synthetic-child"></iframe>')}));
  await installBridge(context,{mode:'openai',fetchImpl:(url,init)=>{scriptRequests++;return fetch(url.replace('http://127.0.0.1:37841',base),init);}});
  const page=context.pages()[0]||await context.newPage(),session=await context.newCDPSession(page);const diagnostics=[];page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text().slice(0,600));});
  const states=()=>page.evaluate(async()=>{const states={};for(const name of ['loopback-network','local-network','camera'])states[name]=(await navigator.permissions.query({name})).state;return states;});
  const probe=()=>page.evaluate(async({base,token})=>{try{const r=await fetch(base+'/health',{headers:{'X-Xuexitong-Token':token},signal:AbortSignal.timeout(4000)});return {status:r.status};}catch(e){return {error:e.name};}},{base,token:local.token});
  const proof={version,isolatedProfile:true,usesRealAccount:false,disablesLnaChecks:false,matrix:[]};
  for(const url of ['https://mooc1.chaoxing.com/mycourse/studentstudy','https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentstudy','https://mooc1.chaoxing.com/exam-ans/exam/test/reVersionTestStartNew']){
    await page.goto(url,{waitUntil:'load'});const origin=new URL(url).origin;
    await session.send('Browser.setPermission',{permission:{name:'loopback-network'},setting:'denied',origin});
    const cameraBefore=(await states()).camera;assert.ok((await probe()).error,'Denied LNA must reproduce the browser failure');
    const nodeHealth=await fetch(base+'/health');assert.equal(nodeHealth.status,200);
    const before=scriptRequests;
    const child=page.frames().find(frame=>frame!==page.mainFrame());assert.ok(child);
    await assert.rejects(child.evaluate(()=>window.__WBGetScripts()),/trusted/i);assert.equal(scriptRequests,before);
    const payload=await page.evaluate(()=>window.__WBGetScripts());assert.equal(payload.service,'xuexitong-ai-helper');assert.equal(payload.sessionId,local.sessionId);
    const pageHealth=await probe(),after=await states();assert.equal(pageHealth.status,200,JSON.stringify({url,after,pageHealth,diagnostics}));assert.equal(after['loopback-network'],'granted');assert.equal(after['local-network'],'prompt');assert.equal(after.camera,cameraBefore);
    const answer=await page.evaluate(async({base,token})=>{const response=await fetch(base+'/answer',{method:'POST',headers:{'Content-Type':'application/json','X-Xuexitong-Token':token},body:JSON.stringify({questions:[{id:1,type:'单选题',question:'Synthetic fixture',options:[{letter:'A',text:'Synthetic one'},{letter:'B',text:'Synthetic two'}]}]})});return {status:response.status,body:await response.json()};},{base,token:local.token});
    assert.equal(answer.status,200);assert.deepEqual(answer.body.answers,[{id:1,letters:['A']}]);
    proof.matrix.push({origin,path:new URL(url).pathname,deniedBeforeFix:true,nodeHealth:200,pageHealth:200,pageAnswer:200,cameraUnchanged:true,lanPermissionUnchanged:true,childBindingDenied:true});
  }
  await page.goto('https://example.com/synthetic');const before=scriptRequests;
  await assert.rejects(page.evaluate(()=>window.__WBGetScripts()),/trusted/i);assert.equal(scriptRequests,before);
  assert.equal((await states())['loopback-network'],'prompt');proof.foreignOriginNotGranted=true;
  const replacement=await context.newPage();await page.close();await replacement.goto('https://mooc1.chaoxing.com/mycourse/studentstudy');
  await replacement.evaluate(()=>window.__WBGetScripts());
  const replacedHealth=await replacement.evaluate(async({base,token})=>(await fetch(base+'/health',{headers:{'X-Xuexitong-Token':token}})).status,{base,token:local.token});
  assert.equal(replacedHealth,200);proof.permissionSurvivesOriginalTabClosure=true;
  const badToken=await fetch(base+'/answer',{method:'POST',headers:{Origin:'https://mooc1.chaoxing.com','Content-Type':'application/json','X-Xuexitong-Token':'invalid-synthetic'},body:'{}'});assert.equal(badToken.status,403);
  assert.equal(answerCalls,3);proof.invalidTokenStatus=badToken.status;proof.answerCalls=answerCalls;
  console.log(JSON.stringify(proof));
}finally{
  await context?.close();await new Promise(resolve=>local.server.close(resolve));
  assert.equal(dirname(resolve(profile)),tempRoot);assert.ok(basename(profile).startsWith('wb-lna-smoke-'));rmSync(profile,{recursive:true,force:true});
}
