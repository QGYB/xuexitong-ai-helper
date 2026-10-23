// Synthetic, fully specified decisions. Gold labels are computed before inference.
import assert from 'node:assert/strict';
const cases=[];
const add=(id,type,question,options,gold,category)=>cases.push({id,suite:'context-decisions',type,question,options:options.map((text,i)=>({id:String(i),text})),gold:gold.map(String),category});
const accessRows=[
  {revoked:true,admin:true,owner:true,public:true},
  {revoked:false,admin:true,owner:false,public:false},
  {revoked:false,admin:false,owner:true,public:false},
  {revoked:false,admin:false,owner:false,public:true},
  {revoked:false,admin:false,owner:false,public:false},
  {revoked:true,admin:false,owner:true,public:true},
  {revoked:true,admin:true,owner:false,public:false},
  {revoked:false,admin:true,owner:true,public:true},
  {revoked:false,admin:false,owner:true,public:true},
  {revoked:true,admin:false,owner:false,public:true},
];
accessRows.forEach((r,i)=>add(`access-${i+1}`,'单选题',`权限规则：账号撤销时始终拒绝，其他条件不能覆盖。账号未撤销且为管理员或资源所有者，允许全部操作；否则，资源公开时只允许读取，资源不公开时转人工核查。账号撤销=${r.revoked?'是':'否'}；管理员=${r.admin?'是':'否'}；资源所有者=${r.owner?'是':'否'}；资源公开=${r.public?'是':'否'}。应作哪项决定？`,['允许全部操作','只允许读取','拒绝访问','转人工核查'],[r.revoked?2:r.admin||r.owner?0:r.public?1:3],'precedence-and-exceptions'));
const priorityRows=[
  {lost:false,blocked:true,minutes:29,paid:true},
  {lost:false,blocked:true,minutes:30,paid:true},
  {lost:false,blocked:true,minutes:30,paid:false},
  {lost:false,blocked:false,minutes:80,paid:true},
  {lost:true,blocked:false,minutes:0,paid:false},
  {lost:true,blocked:true,minutes:45,paid:true},
  {lost:false,blocked:false,minutes:45,paid:false},
  {lost:false,blocked:true,minutes:0,paid:true},
  {lost:false,blocked:true,minutes:31,paid:true},
  {lost:false,blocked:false,minutes:0,paid:false},
];
priorityRows.forEach((r,i)=>add(`priority-${i+1}`,'单选题',`处理规则按优先级执行：存在数据丢失时为“立即处理”；否则仅当业务中断、持续至少30分钟且是付费客户三个条件同时满足时为“优先处理”；其余付费客户为“普通处理”；其他客户为“自助指引”。当前数据丢失=${r.lost?'是':'否'}，业务中断=${r.blocked?'是':'否'}，持续${r.minutes}分钟，付费客户=${r.paid?'是':'否'}。应选择什么？`,['自助指引','普通处理','优先处理','立即处理'],[r.lost?3:r.blocked&&r.minutes>=30&&r.paid?2:r.paid?1:0],'conjunction-and-boundaries'));
for(let i=0;i<10;i++){
  const rows=Array.from({length:4},(_,j)=>({label:`候选${j+1}`,age:16+(i*3+j*2)%10,trained:(i+j)%3!==0,suspended:(i*2+j)%4===0}));
  // Exactly one unambiguous eligible candidate is guaranteed; other matches vary.
  rows[i%4]={label:`候选${i%4+1}`,age:18+(i%4),trained:true,suspended:false};
  const valid=rows.map((r,j)=>r.age>=18&&r.trained&&!r.suspended?j:null).filter(v=>v!==null);
  const state=rows.map(r=>`${r.label}：${r.age}岁，培训${r.trained?'已完成':'未完成'}，资格${r.suspended?'已暂停':'未暂停'}`).join('；');
  add(`eligibility-${i+1}`,'多选题',`选出所有有资格参加的候选人。规则：必须年满18岁并已完成培训，资格已暂停者一律排除，不设其他条件。${state}。`,rows.map(r=>r.label),valid,'multi-label-conjunction');
}
for(let i=0;i<10;i++){
  const rows=Array.from({length:4},(_,j)=>({label:`文件${j+1}`,days:(i*7+j*11)%50,locked:(i+j)%3===0,pinned:(i*2+j)%4===0}));
  rows[(i+1)%4]={label:`文件${(i+1)%4+1}`,days:31+(i%8),locked:false,pinned:false};
  const valid=rows.map((r,j)=>r.days>30&&!r.locked&&!r.pinned?j:null).filter(v=>v!==null);
  add(`retention-${i+1}`,'多选题',`按以下规则选出所有需要归档的文件：闲置严格超过30天，且没有锁定，也没有置顶，三个条件缺一不可。${rows.map(r=>`${r.label}：闲置${r.days}天，${r.locked?'已锁定':'未锁定'}，${r.pinned?'已置顶':'未置顶'}`).join('；')}。`,rows.map(r=>r.label),valid,'multi-label-negation');
}
const entailments=[
  ['清单中所有三份记录都已签字。','清单中至少一份记录已签字。',true],
  ['清单中三份记录都没有签字。','清单中至少一份记录已签字。',false],
  ['仅当审核通过且费用已支付，订单才允许发货；审核通过，费用未支付。','根据规则，当前订单允许发货。',false],
  ['仅当审核通过且费用已支付，订单才允许发货；两个条件都已满足，并且没有其他限制。','根据规则，当前订单允许发货。',true],
  ['甲在乙之前到达，乙在丙之前到达，没有同时到达的情况。','甲比丙早到达。',true],
  ['甲在乙之前到达，乙在丙之前到达，没有同时到达的情况。','丙比甲早到达。',false],
  ['去年可用余额为100元，今年新增50元，其后支出20元，此外没有任何收支。','当前可用余额是130元。',true],
  ['这个文件不是公开文件。只有公开文件才允许匿名读取。','这个文件允许匿名读取。',false],
  ['四台设备中只有设备甲离线，其余三台均在线。','四台设备全部在线。',false],
  ['四台设备中只有设备甲离线，其余三台均在线。','至少三台设备在线。',true],
];
entailments.forEach(([state,claim,truth],i)=>add(`entailment-${i+1}`,'判断题',`只依据给定事实判断陈述是否成立，不引入额外假设。事实：${state} 陈述：${claim}`,['成立','不成立'],[truth?0:1],'entailment-and-negation'));
for(let i=0;i<10;i++){
  const amount=100+i*11,credit=20+i*3,debit=15+i*2,actual=amount+credit-debit,claimed=actual+(i%2?1:0);
  add(`ledger-${i+1}`,'判断题',`账本初始余额${amount}元，随后到账${credit}元，又支出${debit}元，没有其他收支。判断：“最终余额恰好为${claimed}元”。`,['正确','错误'],[claimed===actual?0:1],'arithmetic-verification');
}
assert.equal(cases.length,60);
for(const type of ['单选题','多选题','判断题'])assert.equal(cases.filter(c=>c.type===type).length,20);
for(const c of cases){assert.ok(c.gold.length);assert.equal(new Set(c.gold).size,c.gold.length);assert.ok(c.gold.every(id=>c.options.some(o=>o.id===id)));if(c.type!=='多选题')assert.equal(c.gold.length,1);}
export const syntheticCases=cases;
