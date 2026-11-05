export const dynamic='force-dynamic';
import { env } from 'cloudflare:workers';
import { getOwner,serviceAllowed } from '../../../../lib/site-auth';
import { connection,database,json,sameOrigin,synchronize } from '../../../../lib/ticktick';
// Safe persisted readback for the linked cloud task. Never expose the credential.
export async function GET(request:Request){
  const user=await getOwner();
  if(!user&&!await serviceAllowed(request))return json({error:'Войди через ChatGPT.'},401);
  try{
    const c=await database().prepare('SELECT owner_id,config,last_success,last_error FROM ticktick_connection WHERE id=?').bind('main').first<{owner_id:string;config:string;last_success:string|null;last_error:string|null}>();
    if(!c)return json({connected:false,enabled:false});
    if(user&&c.owner_id!==user.userId)return json({error:'Обновление доступно владельцу.'},403);
    const row=await database().prepare('SELECT payload,revision,updated_at FROM dashboard WHERE id=?').bind('main').first<{payload:string;revision:number;updated_at:string}>();
    const tasks: {done?:boolean;archived?:boolean}[]=row?JSON.parse(row.payload).tasks:[];
    return json({connected:true,enabled:JSON.parse(c.config).selected.length>0,lastSuccess:c.last_success,lastError:c.last_error,dashboardRevision:row?.revision,updatedAt:row?.updated_at,taskCount:tasks.length,activeTaskCount:tasks.filter(t=>!t.done&&!t.archived).length});
  }catch{return json({error:'Не удалось проверить результат синхронизации.'},503);}
}
export async function POST(request:Request){
  if(!sameOrigin(request))return json({error:'Запрос с другого сайта запрещён.'},403);
  const user=await getOwner();
  // Owner sessions and the dedicated updater key are the only sync authorities.
  if(!user&&!await serviceAllowed(request))return json({error:'Войди через ChatGPT.'},401);
  try{const c=await connection();if(user&&c&&c.owner_id!==user.userId)return json({error:'Обновление доступно владельцу.'},403);return json(await synchronize());}catch(error){return json({error:error instanceof Error?error.message:'Не удалось обновить задачи.'},503);}
}
