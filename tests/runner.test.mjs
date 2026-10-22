import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {document as fixtureDocument} from './dom.mjs';
import {parseOptions, selectMode, checkNodeVersion, probeService, waitForService, getScripts, installBridge, createBootstrap, acquireInstance, manageContext, launchApplication, runRunner} from '../wb-runner-runtime.mjs';

const health = (sessionId='one', mode='openai') => ({ok:true,service:'xuexitong-ai-helper',protocol:1,sessionId,mode});
const scripts = (sessionId='one') => ({service:'xuexitong-ai-helper',protocol:1,sessionId,consoleScript:'window.consoleRuns=(window.consoleRuns||0)+1;',v3Script:'window.driverAtV3=window.__WB_DRIVER;'});
const response = (body,status=200) => ({status,json:async()=>body});
const fetchPair = (id='one',mode='openai') => async url => response(url.endsWith('/health') ? health(id,mode) : scripts(id));
const tempDir = t => { const dir=mkdtempSync(join(tmpdir(),'wb-runner-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir; };

test('instances are canonical numeric IDs and cannot escape profile directories', () => {
  assert.deepEqual(parseOptions(['2','--workbuddy']),{instance:2,mode:'workbuddy'});
  assert.deepEqual(parseOptions([]),{instance:1,mode:undefined});
  for(const value of ['../x','0','100','1.5','01','-1','1/2','1e1']) assert.throws(()=>parseOptions([value]),/instance/i);
  assert.throws(()=>parseOptions(['--openai','--workbuddy']),/mode/i);
  assert.throws(()=>parseOptions(['1','2']),/argument/i);
});

test('launcher requires Node >=22.12 and chooses only an unambiguous config mode', t => {
  assert.throws(()=>checkNodeVersion('22.11.0'),/22.12/);
  assert.throws(()=>checkNodeVersion('20.99.0'),/22.12/);
  checkNodeVersion('22.12.0'); checkNodeVersion('24.0.0');
  const dir=tempDir(t);
  assert.throws(()=>selectMode(dir),/mode/i);
  writeFileSync(join(dir,'config.json'),'{}'); assert.equal(selectMode(dir),'openai');
  writeFileSync(join(dir,'wb-public-config.json'),'{}');assert.throws(()=>selectMode(dir),/mode/i);
  assert.equal(selectMode(dir,'workbuddy'),'workbuddy');
});

test('HTTP errors, unrelated identity, protocol, and wrong mode never pass health checks', async () => {
  for(const value of [response(health(),403),response(health(),500),response({ok:true}),response({...health(),service:'other'}),response({...health(),protocol:2}),response({...health(),sessionId:''}),response(health('one','workbuddy'))]) {
    await assert.rejects(probeService({mode:'openai',fetchImpl:async()=>value}),/service|health|mode|protocol|identity/i);
  }
  assert.equal((await probeService({mode:'openai',fetchImpl:fetchPair()})).sessionId,'one');
  assert.equal(await probeService({fetchImpl:async()=>{throw new Error('connection refused');}}),null);
});

test('health readiness and script fetch both have finite deadlines', async () => {
  await assert.rejects(waitForService({mode:'openai',timeoutMs:25,requestTimeoutMs:5,pollMs:1,fetchImpl:async()=>new Promise(()=>{})}),/ready|timeout/i);
  await assert.rejects(getScripts({mode:'openai',requestTimeoutMs:10,fetchImpl:async url=>url.endsWith('/health')?response(health()):response(new Promise(()=>{}))}),/timeout/i);
});

test('scripts are requested only after exact health success and must share session identity', async () => {
  const seen=[];
  const fetchImpl=async(url,options)=>{seen.push(url);assert.equal(options.headers?.Origin,undefined);assert.equal(options.redirect,'error');return response(url.endsWith('/health')?health():scripts('stale'));};
  await assert.rejects(getScripts({mode:'openai',fetchImpl}),/session/i);
  assert.deepEqual(seen,['http://127.0.0.1:37841/health','http://127.0.0.1:37841/script']);
  let calls=0;
  await assert.rejects(getScripts({fetchImpl:async()=>{calls++;return response({},403);}}));
  assert.equal(calls,1);
});

function sourceFor(url,child=false){const main={url:()=>url};const frame=child?{url:()=>url}:main;return {frame,page:{mainFrame:()=>main}};}
test('binding refuses foreign origins, child frames, and non-course paths before loading scripts', async () => {
  let binding, calls=0;
  await installBridge({exposeBinding:async(name,fn)=>{assert.equal(name,'__WBGetScripts');binding=fn;}},{fetchImpl:async(...args)=>{calls++;return fetchPair()(...args);},mode:'openai'});
  for(const url of ['https://evil.test/mycourse/studentstudy','http://x.chaoxing.com/mycourse/studentstudy','https://chaoxing.com.evil.test/mycourse/studentstudy','https://x.chaoxing.com/other','https://x.chaoxing.com/mycourse/studentstudy-evil']) await assert.rejects(binding(sourceFor(url)),/trusted/i);
  await assert.rejects(binding(sourceFor('https://x.chaoxing.com/mycourse/studentstudy',true)),/trusted/i);
  assert.equal(calls,0);
  assert.equal((await binding(sourceFor('https://x.chaoxing.com/mycourse/studentstudy'))).sessionId,'one');
  for (const path of ['/mycourse/studentstudy/','/mooc2-ans/mycourse/studentstudy','/mooc2-ans/mycourse/studentstudy/']) {
    assert.equal((await binding(sourceFor(`https://x.chaoxing.com${path}`))).sessionId,'one');
  }
  await assert.rejects(binding(sourceFor('https://x.chaoxing.com/mooc2-ans/mycourse/studentstudy-evil')),/trusted/i);
});

test('new documents fetch the current session after a service restart and reject a navigation during fetch', async () => {
  let binding, id='one';
  await installBridge({exposeBinding:async(name,fn)=>{binding=fn;}},{mode:'openai',fetchImpl:async url=>response(url.endsWith('/health')?health(id):scripts(id))});
  const source=sourceFor('https://x.chaoxing.com/mycourse/studentstudy');
  assert.equal((await binding(source)).sessionId,'one');id='two';assert.equal((await binding(source)).sessionId,'two');
  let url='https://x.chaoxing.com/mycourse/studentstudy';const frame={url:()=>url};
  await installBridge({exposeBinding:async(name,fn)=>{binding=fn;}},{fetchImpl:async request=>{if(request.endsWith('/script'))url='https://evil.test/';return fetchPair()(request);}});
  await assert.rejects(binding({frame,page:{mainFrame:()=>frame}}),/trusted/i);
});

function browserSandbox(url,{child=false,readyState='complete',jquery=true}={}){
  const events={};let calls=0;const errors=[];
  const document=fixtureDocument(url);document.readyState=readyState;
  const window={document,location:new URL(url),addEventListener:(name,callback)=>{events[name]=callback;},MutationObserver:class{constructor(callback){events.mutation=callback;}observe(){}disconnect(){}},jQuery:jquery?()=>{}:undefined,__WBGetScripts:async()=>{calls++;return scripts();}};
  window.top=child?{}:window;
  const ctx=vm.createContext({window,location:window.location,document,console:{error:(...args)=>errors.push(args),log:()=>{}},setInterval:callback=>{events.tick=callback;return 1;},clearInterval:()=>{delete events.tick;}});
  return {window,document,ctx,events,get calls(){return calls;},errors};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('startup status exists on login, overview and blank pages without requesting answer credentials',async()=>{
  for(const url of ['https://passport2.chaoxing.com/login','https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu','about:blank','https://example.com/']){
    const b=browserSandbox(url);vm.runInContext(createBootstrap(),b.ctx);await flush();
    const panel=b.document.querySelector('#xuexitong-independent-status');assert.ok(panel,'startup status must exist before entering a course');
    assert.equal(panel.querySelector('#xuexitong-answer-current').disabled,true);assert.equal(b.calls,0);
    vm.runInContext(createBootstrap(),b.ctx);assert.equal(b.document.querySelectorAll('#xuexitong-independent-status').length,1);
    panel.remove();b.events.mutation();assert.equal(b.document.querySelector('#xuexitong-independent-status'),panel);
  }
  const child=browserSandbox('https://mooc1.chaoxing.com/mycourse/studentstudy',{child:true});vm.runInContext(createBootstrap(),child.ctx);
  assert.equal(child.document.querySelector('#xuexitong-independent-status'),null);
});
test('bootstrap exposes no sources or calls on untrusted pages and subframes', async () => {
  for(const [url,child] of [['https://evil.test/mycourse/studentstudy',false],['http://x.chaoxing.com/mycourse/studentstudy',false],['https://x.chaoxing.com/mycourse/studentstudy',true]]){
    const b=browserSandbox(url,{child});vm.runInContext(createBootstrap({v3Enabled:true}),b.ctx);await flush();
    assert.equal(b.calls,0);assert.equal(b.window.__WB_DRIVER,undefined);assert.equal(b.window.__WB_CS_SRC,undefined);assert.equal(b.window.__WB_V3_SRC,undefined);
  }
});
test('a popup reusing its initial blank Window attaches status to the current document',async()=>{
  const b=browserSandbox('about:blank');vm.runInContext(createBootstrap(),b.ctx);
  const oldPanel=b.document.querySelector('#xuexitong-independent-status');assert.ok(oldPanel);
  const current=fixtureDocument('https://mooc1.chaoxing.com/exam-ans/exam/test/examcode/examnotes');
  b.window.document=current;b.ctx.document=current;b.window.location=new URL(current.URL);b.ctx.location=b.window.location;
  vm.runInContext(createBootstrap(),b.ctx);await flush();
  assert.ok(current.querySelector('#xuexitong-independent-status'),'the initial blank document must not retain the active UI');
  assert.equal(current.querySelectorAll('#xuexitong-independent-status').length,1);assert.equal(b.calls,0);
});
test('document load repairs a reused blank Window even without a second init script',()=>{
  const b=browserSandbox('about:blank');vm.runInContext(createBootstrap(),b.ctx);
  const current=fixtureDocument('https://mooc1.chaoxing.com/exam-ans/exam/test/examcode/examnotes');
  b.window.document=current;b.ctx.document=current;b.events.DOMContentLoaded();
  assert.ok(current.querySelector('#xuexitong-independent-status'));
  assert.equal(b.window.__WBStatusPanel.status.ownerDocument,current);
  assert.equal(b.calls,0);assert.equal(current.querySelector('#xuexitong-answer-current').disabled,true);
});
test('trusted bootstrap waits for document load and jQuery, then chooses console before optional V3', async () => {
  const b=browserSandbox('https://x.chaoxing.com/mycourse/studentstudy?chapterId=1',{readyState:'loading',jquery:false});
  vm.runInContext(createBootstrap({v3Enabled:true}),b.ctx);assert.equal(b.calls,0);
  b.events.load();await flush();assert.equal(b.window.driverAtV3,'console');assert.equal(b.window.consoleRuns,undefined);
  for(let i=0;i<20;i++) b.events.tick?.();
  assert.equal(b.window.consoleRuns,1);assert.equal(b.window.__WB_CS_SRC,undefined);assert.equal(b.window.__WB_V3_SRC,undefined);
  vm.runInContext(createBootstrap({v3Enabled:true}),b.ctx);assert.equal(b.calls,1);
});
test('bootstrap injects console when jQuery is ready without injecting default V3', async () => {
  const b=browserSandbox('https://chaoxing.com/mycourse/studentstudy');vm.runInContext(createBootstrap(),b.ctx);await flush();
  assert.equal(b.window.consoleRuns,1);assert.equal(b.window.driverAtV3,undefined);assert.equal(b.window.__WB_DRIVER,'console');
});
test('both canonical course route families bootstrap while suffix lookalikes do not', async () => {
  for(const path of ['/mycourse/studentstudy/','/mooc2-ans/mycourse/studentstudy','/mooc2-ans/mycourse/studentstudy/']) {
    const b=browserSandbox(`https://x.chaoxing.com${path}`);vm.runInContext(createBootstrap(),b.ctx);await flush();assert.equal(b.window.consoleRuns,1);
  }
  const b=browserSandbox('https://x.chaoxing.com/mooc2-ans/mycourse/studentstudy-evil');vm.runInContext(createBootstrap(),b.ctx);await flush();assert.equal(b.calls,0);
});

test('instance ownership is exclusive and cleanup cannot delete a replacement owner', t => {
  const dir=tempDir(t);const lock=acquireInstance(dir,1);
  assert.equal(lock.profileDir,join(dir,'edge-profile'));assert.ok(existsSync(join(dir,'runner-1.pid')));
  assert.throws(()=>acquireInstance(dir,1),/owned|running|lock/i);
  const second=acquireInstance(dir,2);assert.equal(second.profileDir,join(dir,'edge-profile-2'));second.release();assert.equal(existsSync(join(dir,'runner-2.pid')),false);
  writeFileSync(join(dir,'runner-1.pid'),JSON.stringify({pid:12345,owner:'replacement'}));lock.release();assert.ok(existsSync(join(dir,'runner-1.pid')));
});
test('normal context close, SIGINT and SIGTERM release owned PID and remove listeners', async t => {
  for(const event of ['close','SIGINT','SIGTERM']){
    const dir=tempDir(t);const lock=acquireInstance(dir,1);const proc=new EventEmitter();const context=new EventEmitter();let closes=0;
    context.close=async()=>{closes++;context.emit('close');};
    const done=manageContext(context,lock,proc);(event==='close'?context:proc).emit(event);await done;
    assert.equal(existsSync(join(dir,'runner-1.pid')),false);assert.equal(proc.listenerCount('SIGINT'),0);assert.equal(proc.listenerCount('SIGTERM'),0);if(event!=='close')assert.equal(closes,1);
  }
});

test('launcher never starts or reuses an unrelated listener', async t => {
  const dir=tempDir(t);let starts=0;
  await assert.rejects(launchApplication({directory:dir,args:['--openai'],fetchImpl:async()=>response({},200),spawnImpl:()=>{starts++;throw new Error('unexpected spawn');}}),/service|identity/i);
  assert.equal(starts,0);
});
test('launcher starts a persistent selected service before runner without shell or windows', async t => {
  const dir=tempDir(t);const starts=[];let ready=false,terminated=0,unref=0;
  const service=new EventEmitter();service.pid=98765;service.kill=()=>{terminated++;};service.unref=()=>{unref++;};
  const runner=new EventEmitter();runner.pid=98766;runner.kill=()=>{};
  const spawnImpl=(exe,args,options)=>{starts.push({exe,args,options});if(args[0].endsWith('wb-answer-service.workbuddy.mjs')){ready=true;return service;}setImmediate(()=>runner.emit('exit',0));return runner;};
  await launchApplication({directory:dir,args:['3','--workbuddy'],fetchImpl:async url=>{if(!ready)throw new Error('connection refused');return response(health('one','workbuddy'));},spawnImpl});
  assert.equal(starts.length,2);assert.ok(starts[0].args[0].endsWith('wb-answer-service.workbuddy.mjs'));assert.deepEqual(starts[1].args.slice(1),['3','--workbuddy']);assert.equal(starts[0].options.shell,false);assert.equal(starts[0].options.windowsHide,true);assert.equal(starts[0].options.detached,true);assert.equal(starts[0].options.stdio,'ignore');assert.equal(terminated,0);assert.equal(unref,1);
});

test('launcher reuses only the requested healthy mode and leaves the existing service alone', async t => {
  const dir=tempDir(t);const children=[];let kills=0;
  const spawnImpl=(exe,args)=>{children.push(args);const runner=new EventEmitter();runner.kill=()=>{kills++;};setImmediate(()=>runner.emit('exit',0));return runner;};
  await launchApplication({directory:dir,args:['--openai'],fetchImpl:fetchPair(),spawnImpl});
  assert.equal(children.length,1);assert.ok(children[0][0].endsWith('wb-runner.mjs'));
  assert.equal(kills,0,'never signal an already exited child');
  await assert.rejects(launchApplication({directory:dir,args:['--workbuddy'],fetchImpl:fetchPair(),spawnImpl}),/mode/);
  assert.equal(children.length,1);
});

test('service startup failure cancels readiness polling immediately', async t => {
  const dir=tempDir(t);let probes=0;
  const service=new EventEmitter();service.kill=()=>{};
  const result=launchApplication({directory:dir,args:['--openai'],timeoutMs:1000,fetchImpl:async()=>{probes++;throw new Error('refused');},spawnImpl:()=>{setImmediate(()=>service.emit('exit',1));return service;}});
  await assert.rejects(result,/service exited/i);
  const count=probes;await new Promise(resolve=>setTimeout(resolve,600));
  assert.equal(probes,count,'no readiness requests should outlive service startup failure');
});

test('launcher Ctrl+C gracefully closes a real synthetic Node runner and removes its owned PID', async t => {
  const dir=tempDir(t), proc=new EventEmitter();let child, outcome;
  const runtime=new URL('../wb-runner-runtime.mjs',import.meta.url).href;
  const code=`import {acquireInstance,manageContext} from ${JSON.stringify(runtime)};
    import {EventEmitter} from 'node:events';
    const lock=acquireInstance(${JSON.stringify(dir)},1);const context=new EventEmitter();
    context.close=async()=>{context.emit('close');};
    process.on('message',m=>{if(m?.type==='wb:stop')context.close();});
    const done=manageContext(context,lock);process.send({type:'ready'});
    await done;process.disconnect();`;
  t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));}});
  const spawnImpl=(exe,args,options)=>{
    child=spawn(exe,['--input-type=module','-e',code],{...options,stdio:['ignore','ignore','pipe','ipc']});
    child.once('message',()=>proc.emit('SIGINT'));return child;
  };
  try{await launchApplication({directory:dir,args:['--openai'],fetchImpl:fetchPair(),spawnImpl,proc,stopTimeoutMs:1000});}catch(error){outcome=error;}
  assert.equal(existsSync(join(dir,'runner-1.pid')),false,'ordinary launcher stop must let the Node runner release its lock');
  assert.equal(outcome,undefined);
  assert.equal(child.exitCode,0);
});

for (const stopKind of ['IPC','SIGINT','SIGTERM']) test(`runner handles ${stopKind} during its first service wait and releases the startup lock`, async t => {
  const dir=tempDir(t);
  for(const name of ['wb-runner.mjs','wb-runner-runtime.mjs'])writeFileSync(join(dir,name),readFileSync(new URL(`../${name}`,import.meta.url)));
  mkdirSync(join(dir,'browser'));writeFileSync(join(dir,'browser/status-panel.mjs'),readFileSync(new URL('../browser/status-panel.mjs',import.meta.url)));
  const code=`process.argv=['node','wb-runner.mjs','--openai'];globalThis.fetch=async()=>{process.send({type:'waiting'});return new Promise(()=>{});};
    process.on('message',m=>{if(m?.type==='test:signal')process.emit(m.signal);});
    await import(${JSON.stringify(pathToFileURL(join(dir,'wb-runner.mjs')).href)});
    if(process.connected)process.disconnect();`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,'--','--openai'],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
  const ended=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await ended;}});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Synthetic runner did not reach health wait')),3000);child.once('message',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Runner exited before health wait'));});});
  assert.ok(existsSync(join(dir,'runner-1.pid')));
  child.send(stopKind==='IPC'?{type:'wb:stop'}:{type:'test:signal',signal:stopKind});
  let timer;
  const result=await Promise.race([ended,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1500);})]);clearTimeout(timer);
  assert.notEqual(result,null,`${stopKind} must abort the startup service wait`);
  assert.equal(result.code,0);assert.equal(existsSync(join(dir,'runner-1.pid')),false);
});

test('stop during browser launch keeps ownership until the returned context closes', async t => {
  const dir=tempDir(t), proc=new EventEmitter();let completeLaunch,closes=0;
  const context=new EventEmitter();context.close=async()=>{closes++;context.emit('close');};
  let entered;const launching=new Promise(resolve=>{entered=resolve;});
  const running=runRunner({directory:dir,args:['--openai'],proc,fetchImpl:fetchPair(),loadChromium:async()=>({launchPersistentContext:()=>{entered();return new Promise(resolve=>{completeLaunch=resolve;});}})});
  await launching;proc.emit('SIGTERM');
  assert.ok(existsSync(join(dir,'runner-1.pid')),'pending browser launch still owns its profile');
  completeLaunch(context);await running;
  assert.equal(closes,1);assert.equal(existsSync(join(dir,'runner-1.pid')),false);
  assert.equal(proc.listenerCount('SIGINT'),0);assert.equal(proc.listenerCount('message'),0);
});

test('context close rejection retains the uncertain browser lock and removes startup handlers', async t => {
  const dir=tempDir(t), proc=new EventEmitter();let entered;
  const launching=new Promise(resolve=>{entered=resolve;});let completeLaunch;
  const running=runRunner({directory:dir,args:['--openai'],proc,fetchImpl:fetchPair(),loadChromium:async()=>({launchPersistentContext:()=>{entered();return new Promise(resolve=>{completeLaunch=resolve;});}})});
  const context=new EventEmitter();context.close=async()=>{throw new Error('context still running');};
  await launching;proc.emit('SIGINT');completeLaunch(context);
  await assert.rejects(running,/shutdown.*unconfirmed|lock.*retained/i);
  assert.equal(existsSync(join(dir,'runner-1.pid')),true);assert.equal(proc.listenerCount('SIGINT'),0);assert.equal(proc.listenerCount('message'),0);
});

for(const behavior of ['reject','hang']) test(`steady-state stop bounds a ${behavior}ing browser close and retains the uncertain lock`, async t => {
  const dir=tempDir(t),proc=new EventEmitter();let reached;
  const ready=new Promise(resolve=>{reached=resolve;});
  const context=new EventEmitter();context.exposeBinding=async()=>{};context.addInitScript=async()=>{};
  context.pages=()=>[{goto:async()=>{setImmediate(reached);}}];
  context.close=()=>behavior==='reject'?Promise.reject(new Error('browser close failed')):new Promise(()=>{});
  proc.connected=true;let disconnected=0;proc.disconnect=()=>{disconnected++;proc.connected=false;};
  const running=runRunner({directory:dir,args:['--openai'],proc,fetchImpl:fetchPair(),closeTimeoutMs:25,loadChromium:async()=>({launchPersistentContext:async()=>context})});
  const settled=running.then(()=>({ok:true}),error=>({error}));
  await ready;proc.emit('SIGINT');let timer;
  const result=await Promise.race([settled,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),150);})]);clearTimeout(timer);
  assert.notEqual(result,null,'steady-state abort must settle without requiring the browser close event');
  assert.match(result.error?.message||'',/shutdown.*unconfirmed|lock.*retained/i);
  assert.ok(existsSync(join(dir,'runner-1.pid')));assert.equal(proc.listenerCount('SIGINT'),0);assert.equal(proc.listenerCount('message'),0);assert.equal(disconnected,1);
});

test('confirmed steady-state browser closure releases ownership without another close request', async t => {
  const dir=tempDir(t),proc=new EventEmitter();let reached,closes=0;
  const ready=new Promise(resolve=>{reached=resolve;});
  const context=new EventEmitter();context.exposeBinding=async()=>{};context.addInitScript=async()=>{};
  context.pages=()=>[{goto:async()=>{setImmediate(reached);}}];context.close=async()=>{closes++;};
  const running=runRunner({directory:dir,args:['--openai'],proc,fetchImpl:fetchPair(),loadChromium:async()=>({launchPersistentContext:async()=>context})});
  await ready;context.emit('close');await running;
  assert.equal(closes,0);assert.equal(existsSync(join(dir,'runner-1.pid')),false);assert.equal(proc.listenerCount('SIGINT'),0);
});

test('unresponsive synthetic Node child receives one bounded force fallback and is reaped', async t => {
  const dir=tempDir(t),proc=new EventEmitter();let child,kills=0;
  const spawnImpl=(exe,args,options)=>{
    child=spawn(exe,['--input-type=module','-e',"process.on('message',()=>{});setInterval(()=>{},1000);process.send({type:'ready'});"],{...options,stdio:['ignore','ignore','ignore','ipc']});
    const kill=child.kill.bind(child);child.kill=signal=>{kills++;return kill(signal);};
    child.once('message',()=>{proc.emit('SIGINT');proc.emit('SIGTERM');});return child;
  };
  t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));}});
  await assert.rejects(launchApplication({directory:dir,args:['--openai'],fetchImpl:fetchPair(),spawnImpl,proc,stopTimeoutMs:40}),/Runner exited/);
  assert.equal(kills,1);assert.equal(child.signalCode,'SIGKILL');assert.equal(proc.listenerCount('SIGINT'),0);
});
