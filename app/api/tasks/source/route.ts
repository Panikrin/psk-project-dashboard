export const dynamic='force-dynamic';
import { z } from 'zod';
import { json,sameOrigin } from '../../../../lib/ticktick';
import { applySourceSnapshot,markAllowed } from '../../../../lib/psk-tasks';
import { PSK_PROJECT_ID } from '../../../../lib/task-list.mjs';
const card=z.object({id:z.string().regex(/^[a-f0-9]{24}$/),projectId:z.literal(PSK_PROJECT_ID),title:z.string().min(1).max(700),assignee:z.number().int().positive().nullable(),dueDate:z.string().nullable(),startDate:z.string().nullable(),timeZone:z.string().nullable(),isAllDay:z.boolean(),kind:z.literal('TEXT'),repeatFlag:z.string().nullable(),status:z.literal(0)}).strict();
const input=z.object({fetchedAt:z.string().datetime().refine(v=>Math.abs(Date.now()-Date.parse(v))<300000),projectId:z.literal(PSK_PROJECT_ID),tasks:z.array(card).max(1000).refine(ts=>new Set(ts.map(t=>t.id)).size===ts.length)}).strict();
export async function POST(request:Request){
  if(!markAllowed(request))return json({error:'Доступ только серверу Марка.'},401);
  if(!sameOrigin(request))return json({error:'Запрос с другого сайта запрещён.'},403);
  try{const raw=await request.text();if(raw.length>1000000)return json({error:'Слишком большой снимок.'},413);const parsed=input.safeParse(JSON.parse(raw));if(!parsed.success)return json({error:'Неверный формат сверки ПСК.'},400);return json(await applySourceSnapshot(parsed.data));}
  catch(e){return json({error:e instanceof Error?e.message:'Не удалось сохранить сверку.'},409);}
}
