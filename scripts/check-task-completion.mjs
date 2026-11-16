import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { mergeTickTick, remoteFields } from '../lib/ticktick-merge.mjs';
import { sourceOccurrence, PSK_PROJECT_ID, taskCategory, sourceOwner } from '../lib/task-list.mjs';

const require = createRequire(import.meta.url), root = path.resolve('.');
let db, env, requestHeaders = new Headers(), sourceTasks, writes = 0, behavior = 'normal';
function prepare(sql) {
  let params = [];
  const api = { bind(...values) { params = values; return api; },
    async first() { return db.prepare(sql).get(...params) || null; },
    async run() { const result = db.prepare(sql).run(...params); return { meta: { changes: Number(result.changes) } }; },
  }; return api;
}
const binding = { prepare, async batch(statements) { const out=[];db.exec('BEGIN');try{for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;} } };
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file));
  const module = { exports: {} }; cache.set(file, module);
  const localRequire = name => {
    if (name === 'cloudflare:workers') return { env };
    if (name === 'next/headers') return { headers: async () => requestHeaders };
    if (name.startsWith('.')) {
      let target = path.resolve(path.dirname(file), name);
      if (!fs.existsSync(target)) target += '.ts';
      return load(target);
    }
    return require(name);
  };
  let code = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env.DEV', 'false');
  code = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true, esModuleInterop: true } }).outputText;
  const remoteFetch = async (url, options = {}) => {
    const u = new URL(url);
    assert.equal(u.origin, 'https://api.ticktick.com', 'source token sent only to TickTick');
    const complete = u.pathname.match(/\/project\/([^/]+)\/task\/([^/]+)\/complete$/);
    const individual = u.pathname.match(/\/project\/([^/]+)\/task\/([^/]+)$/);
    if (complete) {
      assert.equal(complete[1], PSK_PROJECT_ID);assert.equal(options.method, 'POST');writes++;
      const source=sourceTasks.find(t=>t.id===complete[2]);
      if(behavior==='reject')return new Response('',{status:503});
      if(behavior==='no-change')return new Response('',{status:200});
      if(source.repeatFlag){source.dueDate='2026-11-17T09:00:00+0000';source.startDate=source.dueDate;}else source.status=2;
      if(behavior==='timeout')throw new Error('simulated transport loss');
      return new Response('',{status:200});
    }
    if(individual){const t=sourceTasks.find(t=>t.id===individual[2]);return t&&!(behavior==='hidden'&&t.status===2)?Response.json(t):new Response('',{status:404});}
    if(u.pathname.endsWith('/data'))return Response.json({tasks:sourceTasks.filter(t=>t.status!==2)});
    throw Error('Unexpected source request '+u.pathname);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})', {
    console, Response, Request, Headers, URL, TextEncoder, TextDecoder, crypto, btoa, atob, AbortSignal, Date, fetch: remoteFetch,
  }, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
const source = (changes = {}) => ({ id:'source-1',projectId:PSK_PROJECT_ID,title:'Омега Плаза — учебная проверка',kind:'TEXT',assignee:125735485,dueDate:'2026-11-16T09:00:00+0000',startDate:'2026-11-16T09:00:00+0000',timeZone:'Europe/Moscow',isAllDay:false,status:0,...changes });
async function setup(changes={}) {
  cache.clear();db?.close();db=new DatabaseSync(':memory:');writes=0;behavior='normal';requestHeaders=new Headers();
  db.exec('CREATE TABLE dashboard(id TEXT PRIMARY KEY,payload TEXT,revision INTEGER,updated_at TEXT);CREATE TABLE ticktick_connection(id TEXT PRIMARY KEY,owner_id TEXT,secret_cipher TEXT,config TEXT,last_success TEXT,last_error TEXT,lock_until INTEGER);CREATE TABLE team_auth(id TEXT,version INTEGER);CREATE TABLE team_sessions(id_hash TEXT,auth_version INTEGER,expires_at INTEGER);');
  env={DB:binding,PSK_SYNC_KEY:btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),PSK_MARK_TASKS_KEY:'fixture-agent-key-never-production'};
  sourceTasks=[source(changes)];
  const merged=mergeTickTick({tasks:[],projects:['Задачи PSK']},sourceTasks.map(task=>({task,project:'Задачи PSK'})),[PSK_PROJECT_ID]);
  db.prepare('INSERT INTO dashboard VALUES(?,?,?,?)').run('main',JSON.stringify({tasks:merged.tasks,projects:merged.projects}),1,new Date().toISOString());
  const tick=load(root+'/lib/ticktick.ts'),cipher=await tick.encrypt('fixture-oauth-never-production');
  db.prepare('INSERT INTO ticktick_connection VALUES(?,?,?,?,?,?,?)').run('main','fixture-owner',cipher,JSON.stringify({selected:[{id:PSK_PROJECT_ID,name:'Задачи PSK'}]}),new Date().toISOString(),null,0);
  return { lib:load(root+'/lib/psk-tasks.ts'), task:merged.tasks[0], routes:load(root+'/app/api/tasks/complete/route.ts') };
}
const body = t => ({id:t.id,occurrence:t.ticktick.occurrence,operationId:crypto.randomUUID()});
let x=await setup(),b=body(x.task),result=await x.lib.completeTask(b);
assert.equal(result.ok,true);assert.equal(writes,1);assert.equal(sourceTasks[0].status,2);assert.equal(result.tasks[0].done,true);
result=await x.lib.completeTask(b);assert.equal(writes,1,'same operation never writes twice');assert.equal(result.alreadyComplete,true);
x=await setup({repeatFlag:'RRULE:FREQ=DAILY'});b=body(x.task);result=await x.lib.completeTask(b);
assert.equal(result.advanced,true);assert.equal(result.tasks[0].done,false);assert.equal(result.tasks[0].date,'2026-11-17');
await x.lib.completeTask(b);assert.equal(writes,1,'replayed operation does not complete next recurrence');
x=await setup();b=body(x.task);sourceTasks[0].dueDate='2026-11-20T09:00:00+0000';await assert.rejects(x.lib.completeTask(b),/изменилась/);assert.equal(writes,0);
x=await setup();behavior='reject';b=body(x.task);await assert.rejects(x.lib.completeTask(b));assert.equal(writes,1);await assert.rejects(x.lib.completeTask({...b,operationId:crypto.randomUUID()}),/Предыдущее выполнение/);assert.equal(writes,1,'uncertain writes are never retried automatically');
x=await setup();behavior='timeout';b=body(x.task);await assert.rejects(x.lib.completeTask(b));result=await x.lib.completeTask(b);assert.equal(writes,1);assert.equal(result.tasks[0].done,true,'transport loss recovered by source readback');
x=await setup();behavior='no-change';await assert.rejects(x.lib.completeTask(body(x.task)),/ещё не подтвердил/);assert.equal((await x.lib.taskList(false)).tasks[0].done,false);
x=await setup();behavior='hidden';result=await x.lib.completeTask(body(x.task));assert.equal(result.tasks[0].done,true,'POST acknowledgement plus two source readbacks');
x=await setup();db.prepare('UPDATE ticktick_connection SET lock_until=?').run(Date.now()+10000);await assert.rejects(x.lib.completeTask(body(x.task)),/обновляется/);assert.equal(writes,0);
x=await setup();await assert.rejects(x.lib.completeTask({...body(x.task),id:999}));assert.equal(writes,0);
x=await setup({projectId:'private-family-list'});assert.equal((await x.lib.taskList(false)).tasks.length,0,'other TickTick lists never exposed');
x=await setup({kind:'NOTE'});assert.equal((await x.lib.taskList(false)).tasks.length,0,'notes never exposed');
x=await setup();const req=(headers={})=>new Request('https://psk.test/api/tasks/complete',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body(x.task))});
assert.equal((await x.routes.POST(req())).status,401);
assert.equal((await x.routes.POST(req({'X-PSK-Mark-Key':'wrong'}))).status,401);
assert.equal((await x.routes.POST(req({'X-PSK-Mark-Key':env.PSK_MARK_TASKS_KEY,Origin:'https://foreign.test'}))).status,403);
assert.equal((await x.routes.POST(req({'X-PSK-Mark-Key':env.PSK_MARK_TASKS_KEY}))).status,200);
assert.equal(writes,1);
assert.equal(sourceOwner({assignee:null,title:'Задача'}),'');assert.equal(sourceOwner({assignee:125735485,title:'Задача'}),'@isaevaoa95');
assert.equal(taskCategory({title:'BRIZO №108 — уточнить статус и следующий шаг'}),'sales');assert.equal(taskCategory({title:'BRIZO №98 — выполнить сканирование'}),'work');
assert.equal(remoteFields(source({dueDate:'2026-11-19T19:00:00+0000',isAllDay:true,timeZone:'Asia/Yekaterinburg'}),'ПСК').date,'2026-11-20');
x=await setup({id:'a'.repeat(24)});
const old=source({id:'b'.repeat(24),title:'Старая карточка, которой нет в свежем TickTick'});
const before=await load(root+'/lib/ticktick.ts').state();
const oldMerged=mergeTickTick(before,[{task:old,project:'Задачи PSK'}],[PSK_PROJECT_ID]);
db.prepare('UPDATE dashboard SET payload=?').run(JSON.stringify({tasks:oldMerged.tasks,projects:oldMerged.projects}));
await x.lib.applySourceSnapshot({fetchedAt:new Date().toISOString(),tasks:[sourceTasks[0]]});
result=await x.lib.taskList(false);assert.equal(result.tasks.length,1,'old open cache is hidden, not falsely completed');assert.equal(result.tasks[0].owner,'@isaevaoa95','actual native assignee restored');
const sourceRoute=load(root+'/app/api/tasks/source/route.ts');
const nativeBody={projectId:PSK_PROJECT_ID,fetchedAt:new Date().toISOString(),tasks:sourceTasks.map(t=>({...t,repeatFlag:t.repeatFlag||null}))};
const nativeReq=(value,key)=>new Request('https://psk.test/api/tasks/source',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-PSK-Mark-Key':key}:{})},body:JSON.stringify(value)});
assert.equal((await sourceRoute.POST(nativeReq(nativeBody))).status,401,'human session cannot impersonate the Mark source feed');
assert.equal((await sourceRoute.POST(nativeReq({...nativeBody,tasks:[{...sourceTasks[0],kind:'NOTE'}]},env.PSK_MARK_TASKS_KEY))).status,400,'source feed refuses notes');
assert.equal((await sourceRoute.POST(nativeReq({...nativeBody,projectId:'family'},env.PSK_MARK_TASKS_KEY))).status,400,'source feed refuses other lists');
assert.equal((await sourceRoute.POST(nativeReq({...nativeBody,fetchedAt:'2020-01-01T00:00:00.000Z'},env.PSK_MARK_TASKS_KEY))).status,400,'source feed refuses stale snapshots');
assert.equal((await sourceRoute.POST(nativeReq(nativeBody,env.PSK_MARK_TASKS_KEY))).status,200);
assert.equal(sourceOccurrence(source({dueDate:'2026-11-16T12:00:00+0300'})),sourceOccurrence(source({dueDate:'2026-11-16T09:00:00.000Z'})),'occurrence comparison ignores equivalent timestamp encoding');
db.close();
console.log('PASS: source completion, recurrence advance, idempotent replay, stale dates, rejected and ambiguous writes, safe recovery, concurrent sync lock, PSK-only scope, no notes, authentication, foreign-origin denial, actual assignee IDs and all-day dates');
console.log('PASS: native Mark source feed, actual owners, current membership without inferred completion, stale/foreign/note snapshot rejection, equivalent timestamp normalization');
