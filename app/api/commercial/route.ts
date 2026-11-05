export const dynamic='force-dynamic';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getSiteUser } from '../../../lib/site-auth';
import { trustedRequest } from '../../../lib/client-origin';
import { commercialSchema,emptyCommercial,validateCommercialChange,commercialTotals } from '../../../lib/commercial';
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});}
const name=z.string().trim().min(1).max(80);
async function exists(project:string){const row=await env.DB!.prepare('SELECT payload FROM dashboard WHERE id=?').bind('main').first<{payload:string}>();return !!row&&JSON.parse(row.payload).projects.includes(project);}
async function read(project:string){const row=await env.DB!.prepare('SELECT payload,revision,updated_at AS updatedAt FROM project_commercial WHERE project=?').bind(project).first<{payload:string;revision:number;updatedAt:string}>();return {project,workspace:row?JSON.parse(row.payload):emptyCommercial(),revision:row?.revision||0,updatedAt:row?.updatedAt||null};}
export async function GET(request:Request){
 if(!await getSiteUser())return json({error:'Войди по паролю команды.'},401);
 try{const url=new URL(request.url),project=url.searchParams.get('project')||'';if(!name.safeParse(project).success||!await exists(project))return json({error:'Выбери существующий проект.'},404);
 if(url.searchParams.get('history')==='1'){const history=await env.DB!.prepare('SELECT revision,action,actor,created_at AS createdAt FROM commercial_history WHERE project=? ORDER BY revision DESC LIMIT 30').bind(project).all();return json({history:history.results});}
 const state=await read(project);return json({...state,totals:commercialTotals(state.workspace)});
 }catch(error){console.error('commercial-read',error);return json({error:'Не удалось загрузить экономику объекта.'},503);}
}
export async function PUT(request:Request){
 const user=await getSiteUser();if(!user)return json({error:'Войди по паролю команды.'},401);if(!trustedRequest(request))return json({error:'Запрос с другого сайта запрещён.'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Ожидается JSON.'},415);
 try{const raw=await request.text();if(raw.length>2000000)return json({error:'Слишком много данных в одном запросе.'},413);
 const data=z.object({project:name,revision:z.number().int().min(0),action:z.string().trim().min(1).max(150),workspace:commercialSchema}).parse(JSON.parse(raw));
 if(!await exists(data.project))return json({error:'Проект не найден.'},404);const current=await read(data.project);
 if(current.revision!==data.revision)return json({error:'Другой участник уже сохранил изменения. Обнови данные и повтори.',state:current},409);
 const error=validateCommercialChange(current.workspace,data.workspace);if(error)return json({error},400);
 const now=new Date().toISOString(),payload=JSON.stringify(data.workspace),nextRevision=data.revision+1;
 const update=data.revision===0?env.DB!.prepare('INSERT OR IGNORE INTO project_commercial(project,payload,revision,updated_at) VALUES(?,?,1,?)').bind(data.project,payload,now):env.DB!.prepare('UPDATE project_commercial SET payload=?,revision=revision+1,updated_at=? WHERE project=? AND revision=?').bind(payload,now,data.project,data.revision);
 const audit=env.DB!.prepare('INSERT OR IGNORE INTO commercial_history(id,project,revision,payload,action,actor,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM project_commercial WHERE project=? AND revision=? AND payload=?)').bind(crypto.randomUUID(),data.project,nextRevision,payload,data.action,user.role==='owner'?'Владелец':'Команда ПСК',now,data.project,nextRevision,payload);
 const [result]=await env.DB!.batch([update,audit]);if(result.meta.changes!==1)return json({error:'Данные обновлены другим участником. Загрузи их заново.',state:await read(data.project)},409);
 return json({project:data.project,workspace:data.workspace,revision:nextRevision,updatedAt:now,totals:commercialTotals(data.workspace)});
 }catch(error){if(error instanceof z.ZodError)return json({error:error.issues[0]?.message||'Проверь данные.'},400);if(error instanceof SyntaxError)return json({error:'Некорректные данные.'},400);console.error('commercial-write',error);return json({error:'Не удалось сохранить. Введённые данные остались в форме.'},503);}
}
