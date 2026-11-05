import { z } from 'zod';
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
});
const task = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: z.string().trim().min(1).max(700), project: z.string().trim().min(1).max(80),
  owner: z.string().trim().max(120), start: z.union([isoDate,z.literal('')]), date: z.union([isoDate,z.literal('')]),
  time: z.string().max(40), repeat: z.string().max(160), done: z.boolean(), archived: z.boolean().default(false),
  stage: z.string().trim().max(80).optional(),
  plannedMinutes: z.number().int().min(0).max(6000000).nullable().optional(),
  actualSeconds: z.number().int().min(0).max(360000000).optional(),
  timerStartedAt: z.string().datetime().refine(s=>Date.parse(s)<=Date.now()+60000,'Начало таймера не может быть в будущем.').nullable().optional(),
  subtasks: z.array(z.object({id:z.string().min(1).max(100),title:z.string().trim().min(1).max(300),date:z.union([isoDate,z.literal('')]),done:z.boolean()})).max(100)
    .refine(a=>new Set(a.map(t=>t.id)).size===a.length,'Повторяющиеся подзадачи.').optional(),
  ticktick: z.object({id:z.string().max(150),projectId:z.string().max(150),baseline:z.record(z.union([z.string(),z.boolean()])),missing:z.boolean().optional()}).optional(),
}).refine(t => !t.start || !t.date || t.start <= t.date, 'Начало не может быть позже срока.');
export const schema = z.object({
  revision: z.number().int().positive(), tasks: z.array(task).max(2000),
  projects: z.array(z.string().trim().min(1).max(80)).min(1).max(200),
}).superRefine((s,ctx)=>{
  if(new Set(s.tasks.map(t=>t.id)).size!==s.tasks.length || new Set(s.projects).size!==s.projects.length)
    ctx.addIssue({code:'custom',message:'Повторяющиеся номера задач или проекты.'});
  if(s.tasks.some(t=>!s.projects.includes(t.project))) ctx.addIssue({code:'custom',message:'У задачи указан неизвестный проект.'});
  if(s.tasks.filter(t=>t.timerStartedAt).length>1) ctx.addIssue({code:'custom',message:'Одновременно может работать один таймер.'});
  if(s.tasks.some(t=>t.timerStartedAt&&(t.done||t.archived))) ctx.addIssue({code:'custom',message:'Останови таймер перед завершением задачи.'});
});
