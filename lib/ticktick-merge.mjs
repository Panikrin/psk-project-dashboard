// TickTick is read-only. A source field overwrites a local value only when it
// changed in TickTick since the last import. Stable external IDs prevent duplicates.
const cleanTitle=s=>String(s).normalize('NFKC').toLowerCase().replace(/@[a-z0-9_]+/gi,'').replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim();
// Two paraphrases in the original user-provided snapshot, checked against the
// actual PSK list. These are exact aliases, not fuzzy matching between tasks.
const aliases=new Map([
  [cleanTitle('ДО 10 числа КАЖДОГО МЕСЯЦА ОПЛАЧИВАТЬ СРО ПО РЕКВИЗИТАМ!'),cleanTitle('Оплачивать СРО по реквизитам до 10-го числа каждого месяца.')],
  [cleanTitle('Подготовить и направить в рабочий чат все то, чтос есть по Омега (что касается ремонтных работ)'),cleanTitle('Подготовить и направить в рабочий чат все имеющиеся материалы по Омега (что касается ремонтных работ).')],
]);
export const normalizeTitle=s=>aliases.get(cleanTitle(s))||cleanTitle(s);
export const excluded=t=>/\bBRIZO\s*[№#]?\s*(106|101|92)\b/i.test(t.title+' '+(t.content||''))||/(?:#|\b)(1048222|1662775)\b/.test(t.title+' '+(t.content||''));
function parts(value,zone='Europe/Moscow') {
  if(!value)return null;const d=new Date(value.replace(/([+-]\d\d)(\d\d)$/,'$1:$2'));
  if(!Number.isFinite(d.getTime()))throw new Error('TickTick вернул некорректную дату.');
  let p;try{p=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);}catch{throw new Error('TickTick вернул неизвестный часовой пояс.');}
  const o=Object.fromEntries(p.map(x=>[x.type,x.value]));return {date:o.year+'-'+o.month+'-'+o.day,time:o.hour+':'+o.minute};
}
export function remoteFields(t,project) {
  const due=parts(t.dueDate,t.isAllDay?(t.timeZone||'Europe/Moscow'):'Europe/Moscow');
  const start=parts(t.startDate,t.isAllDay?(t.timeZone||'Europe/Moscow'):'Europe/Moscow');
  return {title:t.title.trim(),project,owner:(t.title.match(/@[a-zA-Z0-9_]+/)||[])[0]||'',start:start?.date||'',date:due?.date||'',time:t.isAllDay?'Весь день':due?.time||'',repeat:t.repeatFlag||'',done:t.status===2};
}
export function mergeTickTick(current,incoming,selectedIds) {
  let tasks=current.tasks.map(t=>({...t}));const projects=[...current.projects],used=new Set(),warnings=[];let nextId=Math.max(0,...tasks.map(t=>t.id))+1;
  for(const {task:r,project:mappedProject} of incoming){
    if(!selectedIds.includes(r.projectId)||excluded(r))continue;
    if(r.kind==='NOTE'){const note=tasks.findIndex(t=>t.ticktick?.id===r.id);if(note>=0)tasks[note]={...tasks[note],archived:true};continue;}
    if(used.has(r.id))continue;used.add(r.id);
    let i=tasks.findIndex(t=>t.ticktick?.id===r.id);
    if(i>=0){const matches=tasks.filter(t=>!t.ticktick&&normalizeTitle(t.title)===normalizeTitle(r.title));if(matches.length===1){const original=matches[0],imported=tasks[i];const reconciled={...imported,...original,ticktick:{...imported.ticktick,baseline:{...imported.ticktick.baseline,project:original.project,owner:original.owner||imported.owner}}};tasks=tasks.filter((_,j)=>j!==i).map(t=>t.id===original.id?reconciled:t);i=tasks.findIndex(t=>t.id===original.id);}}
    if(i<0){const matches=tasks.map((t,j)=>({t,j})).filter(({t})=>!t.ticktick&&normalizeTitle(t.title)===normalizeTitle(r.title));if(matches.length===1)i=matches[0].j;else if(matches.length>1){warnings.push('Несколько совпадений: '+r.title);continue;}}
    const previous=i<0?null:tasks[i];
    let project=previous?.project||mappedProject;
    if(!previous){const named=projects.filter(p=>normalizeTitle(p).length>4&&normalizeTitle(r.title).includes(normalizeTitle(p)));if(named.length===1)project=named[0];}
    const fields=remoteFields(r,project);if(previous&&!fields.owner)fields.owner=previous.owner;
    const result=previous?{...previous}:{id:nextId++,archived:false,...fields};
    for(const [key,value]of Object.entries(fields)){
      if(!previous?.ticktick||JSON.stringify(previous.ticktick.baseline?.[key])!==JSON.stringify(value))result[key]=value;
    }
    result.ticktick={id:r.id,projectId:r.projectId,baseline:fields,missing:false};
    if((result.done||result.archived)&&result.timerStartedAt){result.actualSeconds=(result.actualSeconds||0)+Math.max(0,Math.floor((Date.now()-Date.parse(result.timerStartedAt))/1000));result.timerStartedAt=null;}
    if(i<0)tasks.push(result);else tasks[i]=result;if(!projects.includes(result.project))projects.push(result.project);
  }
  // Do not infer completion or deletion from absence in an incomplete task list.
  // Individual task lookups are included by the caller when their status is known.
  return {tasks,projects,warnings,sourceCount:used.size};
}
