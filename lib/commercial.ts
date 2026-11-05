import { z } from 'zod';
const id=z.string().uuid();
const text=z.string().trim().min(1).max(300);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;},'Проверь дату.');
const money=z.number().finite().min(0).max(100000000).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'В цене допускается два знака после запятой.');
const quantity=z.number().finite().positive().max(1000000).refine(n=>Math.abs(n*1000-Math.round(n*1000))<0.00001,'В количестве допускается три знака после запятой.');
const position=z.object({id,stage:z.string().trim().max(100),title:text,type:z.enum(['labor','material','equipment','delivery']),unit:z.string().trim().min(1).max(30),quantity,costPrice:money,salePrice:money});
const estimate=z.object({id,name:text,status:z.enum(['draft','approved','archived']),positions:z.array(position).max(500)});
const purchase=z.object({id,estimateId:id,positionId:id,supplier:z.string().trim().max(200),quantity,price:money,date,status:z.enum(['planned','received']),archived:z.boolean()});
const execution=z.object({id,estimateId:id,positionId:id,quantity,costPrice:money,date,note:z.string().trim().max(500),archived:z.boolean()});
const act=z.object({id,estimateId:id,number:z.string().trim().min(1).max(80),date,status:z.enum(['draft','signed','canceled']),items:z.array(z.object({positionId:id,title:text,unit:z.string().trim().min(1).max(30),quantity,price:money})).min(1).max(500)});
const payment=z.object({id,estimateId:id.nullable(),direction:z.enum(['income','expense']),status:z.enum(['planned','actual']),date,amount:money.refine(n=>n>0,'Сумма должна быть больше нуля.'),category:z.string().trim().min(1).max(100),counterparty:z.string().trim().max(200),note:z.string().trim().max(500),archived:z.boolean()});
export const emptyCommercial=()=>({estimates:[],purchases:[],executions:[],acts:[],payments:[]});
export const commercialSchema=z.object({estimates:z.array(estimate).max(50),purchases:z.array(purchase).max(2000),executions:z.array(execution).max(3000),acts:z.array(act).max(500),payments:z.array(payment).max(3000)}).superRefine((w,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 const ids=[...w.estimates.map(x=>x.id),...w.estimates.flatMap(x=>x.positions.map(p=>p.id)),...w.purchases.map(x=>x.id),...w.executions.map(x=>x.id),...w.acts.map(x=>x.id),...w.payments.map(x=>x.id)];
 if(new Set(ids).size!==ids.length)fail('Повторяющиеся номера записей.');
 const amounts=[...w.estimates.flatMap(e=>e.positions.flatMap(p=>[lineCents(p.quantity,p.costPrice),lineCents(p.quantity,p.salePrice)])),...w.purchases.map(x=>lineCents(x.quantity,x.price)),...w.executions.map(x=>lineCents(x.quantity,x.costPrice)),...w.acts.flatMap(a=>a.items.map(x=>lineCents(x.quantity,x.price))),...w.payments.map(x=>lineCents(1,x.amount))];
 if(amounts.some(x=>!Number.isSafeInteger(x))||!Number.isSafeInteger(amounts.reduce((n,x)=>n+x,0)))fail('Суммы превышают допустимую точность расчёта.');
 const estimates=new Map(w.estimates.map(x=>[x.id,x]));
 const pos=(estimateId:string,positionId:string)=>estimates.get(estimateId)?.positions.find(p=>p.id===positionId);
 for(const p of w.purchases){const line=pos(p.estimateId,p.positionId);if(!line)fail('Покупка ссылается на неизвестную позицию.');else if(line.type==='labor')fail('Для работ используй раздел выполнения.');}
 for(const x of w.executions){const line=pos(x.estimateId,x.positionId);if(!line)fail('Выполнение ссылается на неизвестную позицию.');else if(line.type!=='labor'&&x.costPrice!==0)fail('Затраты материалов и техники учитываются в закупках.');}
 for(const p of w.payments)if(p.estimateId&&!estimates.has(p.estimateId))fail('Оплата ссылается на неизвестную смету.');
 const billed=new Map<string,number>();
 for(const a of w.acts){if(!estimates.has(a.estimateId))fail('Акт ссылается на неизвестную смету.');if(new Set(a.items.map(x=>x.positionId)).size!==a.items.length)fail('Повторяющаяся позиция акта.');for(const item of a.items){if(!pos(a.estimateId,item.positionId))fail('Акт ссылается на неизвестную позицию.');if(a.status==='signed')billed.set(item.positionId,(billed.get(item.positionId)||0)+item.quantity);}}
 for(const [positionId,qty] of billed){const done=w.executions.filter(x=>!x.archived&&x.positionId===positionId).reduce((n,x)=>n+x.quantity,0);if(qty>done+0.000001)fail('В подписанных актах больше объёма, чем в выполнении. Сначала внеси выполненные работы.');}
});
export type Commercial=z.infer<typeof commercialSchema>;
// Prices are rubles; all monetary totals are calculated and summed as integer kopecks.
export const lineCents=(quantity:number,price:number)=>Number((BigInt(Math.round(quantity*1000))*BigInt(Math.round(price*100))+BigInt(500))/BigInt(1000));
export function commercialTotals(w:Commercial,estimateId?:string){
 const es=w.estimates.filter(e=>!estimateId||e.id===estimateId),ids=new Set(es.map(e=>e.id));
 const positions=es.flatMap(e=>e.positions),purchases=w.purchases.filter(x=>!x.archived&&ids.has(x.estimateId)),executions=w.executions.filter(x=>!x.archived&&ids.has(x.estimateId));
 const acts=w.acts.filter(x=>ids.has(x.estimateId)&&x.status==='signed'),payments=w.payments.filter(x=>!x.archived&&(!estimateId||x.estimateId===estimateId));
 const sum=(a:number[])=>a.reduce((n,x)=>n+x,0),planCost=sum(positions.map(x=>lineCents(x.quantity,x.costPrice))),planSale=sum(positions.map(x=>lineCents(x.quantity,x.salePrice)));
 const actualCost=sum(purchases.filter(x=>x.status==='received').map(x=>lineCents(x.quantity,x.price)))+sum(executions.map(x=>lineCents(x.quantity,x.costPrice)));
 const accepted=sum(acts.flatMap(x=>x.items.map(i=>lineCents(i.quantity,i.price))));
 const received=sum(payments.filter(x=>x.status==='actual'&&x.direction==='income').map(x=>lineCents(1,x.amount))),paid=sum(payments.filter(x=>x.status==='actual'&&x.direction==='expense').map(x=>lineCents(1,x.amount)));
 const completed=sum(positions.map(p=>lineCents(Math.min(p.quantity,executions.filter(x=>x.positionId===p.id).reduce((n,x)=>n+x.quantity,0)),p.salePrice)));
 return {planCost,planSale,actualCost,accepted,received,paid,planProfit:planSale-planCost,accruedResult:accepted-actualCost,cashBalance:received-paid,customerDebt:Math.max(0,accepted-received),customerAdvance:Math.max(0,received-accepted),progress:planSale?Math.round(completed/planSale*100):null};
}
export function validateCommercialChange(before:Commercial,after:Commercial){
 for(const key of ['estimates','purchases','executions','acts','payments'] as const)if(before[key].some(old=>!after[key].some(x=>x.id===old.id)))return 'Записи сохраняются в истории. Используй архив или отмену вместо удаления.';
 for(const old of before.estimates){const next=after.estimates.find(x=>x.id===old.id)!;if(old.positions.some(p=>!next.positions.some(x=>x.id===p.id)))return 'Позиции сметы нельзя удалять после сохранения.';for(const p of old.positions){const n=next.positions.find(x=>x.id===p.id)!;const used=before.purchases.some(x=>x.positionId===p.id)||before.executions.some(x=>x.positionId===p.id)||before.acts.some(x=>x.items.some(i=>i.positionId===p.id));if(used&&n.type!==p.type)return 'Тип используемой позиции менять нельзя.';}}
 for(const old of before.acts.filter(x=>x.status==='signed')){const next=after.acts.find(x=>x.id===old.id)!;if(JSON.stringify({...old,status:next.status})!==JSON.stringify(next)||!['signed','canceled'].includes(next.status))return 'Подписанный акт можно только отменить. Для изменений создай новый акт.';}
 return null;
}
