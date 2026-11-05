export const dynamic = "force-dynamic";
import { env } from 'cloudflare:workers';
import { schema } from '../../../lib/dashboard-schema';
import { getSiteUser } from '../../../lib/site-auth';
import seed from '../../../lib/seed.json';
import { trustedRequest } from '../../../lib/client-origin';
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});}
async function readState() {
  if (!env.DB) throw new Error('Database binding missing');
  await env.DB.prepare('INSERT OR IGNORE INTO dashboard (id,payload,revision,updated_at) VALUES (?,?,?,?)')
    .bind('main',JSON.stringify(seed),1,new Date().toISOString()).run();
  const row=await env.DB.prepare('SELECT payload,revision,updated_at FROM dashboard WHERE id=?').bind('main')
    .first<{payload:string;revision:number;updated_at:string}>();
  if(!row) throw new Error('Dashboard unavailable');
  return {...JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at};
}
export async function GET() {
  if(!await getSiteUser()) return json({error:'Войди по паролю команды.'},401);
  try{return json(await readState());}catch(error){console.error('dashboard-read',error);return json({error:'Не удалось загрузить задачи. Попробуй ещё раз.'},503);}
}
export async function PUT(request:Request) {
  if(!await getSiteUser()) return json({error:'Войди по паролю команды.'},401);
  if(!trustedRequest(request)) return json({error:'Запрос с другого сайта запрещён.'},403);
  if(!request.headers.get('content-type')?.includes('application/json')) return json({error:'Ожидается JSON.'},415);
  try {
    const raw=await request.text();if(raw.length>1500000)return json({error:'Слишком большой список задач.'},413);
    let decoded:unknown;try{decoded=JSON.parse(raw);}catch{return json({error:'Некорректные данные.'},400);}
    const result=schema.safeParse(decoded);if(!result.success)return json({error:result.error.issues[0]?.message||'Проверь поля задачи.'},400);
    const {revision,tasks,projects}=result.data,updatedAt=new Date().toISOString();
    const previous=await readState(),payload=JSON.stringify({tasks,projects});
    const removed=previous.projects.filter((p:string)=>!projects.includes(p)),added=projects.filter((p:string)=>!previous.projects.includes(p));
    const statements=[env.DB!.prepare('UPDATE dashboard SET payload=?, revision=revision+1, updated_at=? WHERE id=? AND revision=?')
      .bind(payload,updatedAt,'main',revision)];
    if(removed.length===1&&added.length===1){
      statements.push(env.DB!.prepare('UPDATE project_profiles SET project=?,revision=revision+1 WHERE project=? AND EXISTS(SELECT 1 FROM dashboard WHERE id=? AND revision=? AND payload=?)').bind(added[0],removed[0],'main',revision+1,payload));
      statements.push(env.DB!.prepare('UPDATE project_drive SET project=? WHERE project=? AND EXISTS(SELECT 1 FROM dashboard WHERE id=? AND revision=? AND payload=?)').bind(added[0],removed[0],'main',revision+1,payload));
      statements.push(env.DB!.prepare('UPDATE project_media SET project=? WHERE project=? AND EXISTS(SELECT 1 FROM dashboard WHERE id=? AND revision=? AND payload=?)').bind(added[0],removed[0],'main',revision+1,payload));
      for(const table of ['project_commercial','commercial_history']) statements.push(env.DB!.prepare(`UPDATE ${table} SET project=? WHERE project=? AND EXISTS(SELECT 1 FROM dashboard WHERE id=? AND revision=? AND payload=?)`).bind(added[0],removed[0],'main',revision+1,payload));
    }
    const [update]=await env.DB!.batch(statements);
    if(update.meta.changes!==1)return json({error:'На другом устройстве уже есть изменения. Список обновлён; проверь карточку и сохрани ещё раз.',state:await readState()},409);
    return json({tasks,projects,revision:revision+1,updatedAt});
  }catch(error){console.error('dashboard-write',error);return json({error:'Не удалось сохранить. Проверь интернет и повтори — карточка осталась открытой.'},503);}
}
