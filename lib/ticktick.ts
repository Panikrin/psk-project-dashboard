import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { mergeTickTick, excluded } from './ticktick-merge.mjs';
import seed from './seed.json';
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export function sameOrigin(r:Request){return r.headers.get('sec-fetch-site')!=='cross-site'&&(!r.headers.get('origin')||r.headers.get('origin')===new URL(r.url).origin);}
const db=()=>{if(!env.DB)throw new Error('База временно недоступна.');return env.DB;};
const connectionSchema=z.object({owner_id:z.string(),secret_cipher:z.string(),config:z.string(),last_success:z.string().nullable(),last_error:z.string().nullable(),lock_until:z.number()});
export async function connection(){const row=await db().prepare('SELECT owner_id,secret_cipher,config,last_success,last_error,lock_until FROM ticktick_connection WHERE id=?').bind('main').first();return row?connectionSchema.parse(row):null;}
async function key(){if(!env.PSK_SYNC_KEY)throw new Error('Защищённое хранилище не настроено.');const bytes=Uint8Array.from(atob(env.PSK_SYNC_KEY),c=>c.charCodeAt(0));return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function encrypt(token:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),new TextEncoder().encode(token)));return btoa(String.fromCharCode(...iv,...cipher));}
export async function decrypt(cipher:string){const a=Uint8Array.from(atob(cipher),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:a.slice(0,12)},await key(),a.slice(12)));}
export async function tickRequest(token:string,path:string){
  const response=await fetch('https://api.ticktick.com/open/v1'+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(response.status===401||response.status===403)throw new Error('TickTick не принял токен. Проверь доступ или создай новый токен в настройках TickTick.');
  if(response.status===429)throw new Error('TickTick просит снизить частоту запросов. Повторим позже.');
  if(response.status===404)return null;if(!response.ok)throw new Error('TickTick временно недоступен. Последние сохранённые задачи остаются на сайте.');
  return response.json();
}
export const projectList=z.array(z.object({id:z.string().min(1).max(150),name:z.string().max(200),kind:z.string().optional()}));
const remoteTask=z.object({id:z.string().min(1),projectId:z.string().min(1),title:z.string().min(1).max(700),kind:z.string().optional(),content:z.string().optional(),startDate:z.string().nullish(),dueDate:z.string().nullish(),isAllDay:z.boolean().optional(),timeZone:z.string().optional(),repeatFlag:z.string().nullish(),status:z.number().optional()});
const projectData=z.object({tasks:z.array(remoteTask).max(2000)});
export const selectionSchema=z.array(z.object({id:z.string().min(1).max(150),name:z.string().trim().min(1).max(80)})).min(1).max(40);
export async function state(){await db().prepare('INSERT OR IGNORE INTO dashboard (id,payload,revision,updated_at) VALUES (?,?,1,?)').bind('main',JSON.stringify(seed),new Date().toISOString()).run();const row=await db().prepare('SELECT payload,revision FROM dashboard WHERE id=?').bind('main').first<{payload:string;revision:number}>();if(!row)throw new Error('Задачи пока недоступны.');return {...JSON.parse(row.payload),revision:row.revision};}
export async function synchronize(force=false){
  const c=await connection();if(!c)return {connected:false,enabled:false};const config=JSON.parse(c.config),selected=selectionSchema.safeParse(config.selected);
  if(!selected.success)return {connected:true,enabled:false};
  if(!force&&c.last_success&&Date.now()-Date.parse(c.last_success)<60000)return {connected:true,enabled:true,lastSuccess:c.last_success,skipped:true};
  const now=Date.now(),lease=now+180000;const lock=await db().prepare('UPDATE ticktick_connection SET lock_until=? WHERE id=? AND lock_until<?').bind(lease,'main',now).run();
  if(lock.meta.changes!==1)return {connected:true,enabled:true,busy:true};
  try{
    const token=await decrypt(c.secret_cipher),incoming:any[]=[];
    for(const p of selected.data){const data=projectData.parse(await tickRequest(token,'/project/'+encodeURIComponent(p.id)+'/data'));for(const t of data.tasks)incoming.push({task:t,project:p.name});}
    const before=await state(),seen=new Set(incoming.map(x=>x.task.id)),selectedSet=new Set(selected.data.map(x=>x.id));
    // Resolve tracked tasks omitted by the project's undone view; absence alone is not a completion event.
    for(const t of before.tasks){if(!t.ticktick||seen.has(t.ticktick.id)||!selectedSet.has(t.ticktick.projectId))continue;const raw=await tickRequest(token,'/project/'+encodeURIComponent(t.ticktick.projectId)+'/task/'+encodeURIComponent(t.ticktick.id));if(raw){const parsed=remoteTask.parse(raw);incoming.push({task:parsed,project:t.project});}}
    if(incoming.length>2000)throw new Error('Слишком много задач для одного дашборда. Выбери меньше списков.');
    let changed=false,warnings:string[]=[];
    for(let n=0;n<3;n++){const current=await state(),merged=mergeTickTick(current,incoming,selected.data.map(x=>x.id));warnings=merged.warnings;const payload=JSON.stringify({tasks:merged.tasks,projects:merged.projects});if(payload===JSON.stringify({tasks:current.tasks,projects:current.projects}))break;
      const result=await db().prepare('UPDATE dashboard SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(payload,new Date().toISOString(),'main',current.revision).run();if(result.meta.changes===1){changed=true;break;}if(n===2)throw new Error('Задачи сейчас редактируются. Повторим синхронизацию позже.');}
    const lastSuccess=new Date().toISOString();await db().prepare('UPDATE ticktick_connection SET last_success=?,last_error=NULL WHERE id=? AND lock_until=?').bind(lastSuccess,'main',lease).run();return {connected:true,enabled:true,lastSuccess,changed,warnings,sourceCount:incoming.filter(x=>x.task.kind!=='NOTE'&&!excluded(x.task)).length};
  }catch(error){const message=error instanceof z.ZodError?'TickTick вернул неожиданный формат данных. Сохранённый список не изменён.':error instanceof Error?error.message:'Не удалось обновить TickTick.';await db().prepare('UPDATE ticktick_connection SET last_error=? WHERE id=? AND lock_until=?').bind(message,'main',lease).run();throw new Error(message);
  }finally{await db().prepare('UPDATE ticktick_connection SET lock_until=0 WHERE id=? AND lock_until=?').bind('main',lease).run();}
}
export const database=db;
