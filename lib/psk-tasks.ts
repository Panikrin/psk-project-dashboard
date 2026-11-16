import { env } from 'cloudflare:workers';
import { equal } from './password-crypto.mjs';
import { getSiteUser } from './site-auth';
import { connection, database, decrypt, state, synchronize, tickRequest } from './ticktick';
import { mergeTickTick, remoteFields } from './ticktick-merge.mjs';
import { guardSource, PSK_PROJECT_ID, sourceOccurrence, sourceOwner, taskCategory, taskProject } from './task-list.mjs';
import { performCompletion } from './task-completion.mjs';

export async function tasksAllowed(request: Request) {
  // The agent key is restricted to these two PSK-only routes. It does not grant
  // dashboard edits, owner settings, credentials, media, or other TickTick lists.
  if (markAllowed(request)) return true;
  return !!await getSiteUser();
}

export function markAllowed(request: Request) {
  const key = request.headers.get('X-PSK-Mark-Key');
  return !!key && !!env.PSK_MARK_TASKS_KEY && equal(key, env.PSK_MARK_TASKS_KEY);
}

async function sourceSnapshot(): Promise<any> {
  await database().prepare('CREATE TABLE IF NOT EXISTS psk_source_snapshot(id TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at TEXT NOT NULL)').run();
  const row = await database().prepare('SELECT payload,fetched_at FROM psk_source_snapshot WHERE id=?').bind('main').first<{payload:string;fetched_at:string}>();
  return row ? { tasks: JSON.parse(row.payload), fetchedAt: row.fetched_at } : null;
}

export async function applySourceSnapshot(snapshot: any) {
  await sourceSnapshot();
  const now=Date.now(),lease=now+90000;
  const lock=await database().prepare('UPDATE ticktick_connection SET lock_until=? WHERE id=? AND lock_until<?').bind(lease,'main',now).run();
  if(lock.meta.changes!==1)throw new Error('Идёт другая сверка. Повтори позже.');
  try {
    const old=await sourceSnapshot();
    if(old&&Date.parse(snapshot.fetchedAt)<Date.parse(old.fetchedAt))throw new Error('Снимок старее уже сохранённой сверки.');
    for(let attempt=0;attempt<4;attempt++){
      const current=await state();
      const merged=mergeTickTick(current,snapshot.tasks.map((task:any)=>({task,project:'Задачи PSK'})),[PSK_PROJECT_ID]);
      const update=await database().prepare('UPDATE dashboard SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
        .bind(JSON.stringify({tasks:merged.tasks,projects:merged.projects}),new Date().toISOString(),'main',current.revision).run();
      if(update.meta.changes!==1){if(attempt===3)throw new Error('Список сейчас редактируется.');continue;}
      await database().prepare('INSERT INTO psk_source_snapshot(id,payload,fetched_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at')
        .bind('main',JSON.stringify(snapshot.tasks),snapshot.fetchedAt).run();
      return {ok:true,activeCount:snapshot.tasks.length,fetchedAt:snapshot.fetchedAt,revision:current.revision+1};
    }
  } finally {await database().prepare('UPDATE ticktick_connection SET lock_until=0 WHERE id=? AND lock_until=?').bind('main',lease).run();}
}

export async function taskList(refresh = true) {
  let warning = '';
  const snapshot=await sourceSnapshot();
  if (refresh&&!snapshot) try { await synchronize(); } catch (e) { warning = e instanceof Error ? e.message : 'Не удалось обновить TickTick.'; }
  if(snapshot&&Date.now()-Date.parse(snapshot.fetchedAt)>180000)warning='Сверка Марка задерживается. Показан последний подтверждённый список.';
  const current = await state(), c = await connection();
  const active=new Map<string,any>((snapshot?.tasks||[]).map((t:any)=>[t.id,t]));
  const tasks = current.tasks.filter((t: any) => t.ticktick?.projectId === PSK_PROJECT_ID && !t.archived && (!snapshot||t.done||active.has(t.ticktick.id))).map((t: any) => {
    const source=active.get(t.ticktick.id),fields=source?remoteFields(source,taskProject(source)):null;
    const same=source&&sourceOccurrence(source)===t.ticktick.occurrence;
    return ({
    id: t.id, title: t.title, project: taskProject(t), owner: t.owner || '',
    ...(source?{owner:sourceOwner(source)}:{}),
    date: same?fields!.date:t.date, time: same?fields!.time:t.time, repeat: t.repeat, done: t.done,
    category: taskCategory(t), occurrence: t.ticktick.occurrence || '',
    canComplete: !t.done && !!t.ticktick.occurrence,
  });});
  return { tasks, revision: current.revision,
    sync: { lastSuccess: snapshot?.fetchedAt||c?.last_success || null, error: warning || c?.last_error || '', connected: !!c,
      enabled: !!c && JSON.parse(c.config).selected?.some((p: any) => p.id === PSK_PROJECT_ID) },
  };
}

async function ensureLedger() {
  await database().prepare(`CREATE TABLE IF NOT EXISTS psk_task_completions (
    operation_id TEXT PRIMARY KEY, remote_task_id TEXT NOT NULL, occurrence TEXT NOT NULL,
    status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(remote_task_id, occurrence)
  )`).run();
}

async function mergeConfirmed(source: any) {
  for (let i = 0; i < 4; i++) {
    const current = await state();
    const merged = mergeTickTick(current, [{ task: source, project: 'Задачи PSK' }], [PSK_PROJECT_ID]);
    const result = await database().prepare('UPDATE dashboard SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
      .bind(JSON.stringify({ tasks: merged.tasks, projects: merged.projects }), new Date().toISOString(), 'main', current.revision).run();
    if (result.meta.changes === 1) return;
  }
  throw new Error('Выполнение принято TickTick. Список сейчас редактируется; обнови страницу для проверки.');
}

export async function completeTask(body: { id: number; occurrence: string; operationId: string }) {
  const current = await state(), task = current.tasks.find((t: any) => t.id === body.id);
  if (!task?.ticktick || task.ticktick.projectId !== PSK_PROJECT_ID || task.archived) throw new Error('Задача не найдена в рабочем списке ПСК. Обнови страницу.');
  const c = await connection();
  if (!c || !JSON.parse(c.config).selected?.some((p: any) => p.id === PSK_PROJECT_ID)) throw new Error('Синхронизация ПСК с TickTick приостановлена. Галочка не сохранена.');
  await ensureLedger();
  const now = Date.now(), lease = now + 120000;
  const lock = await database().prepare('UPDATE ticktick_connection SET lock_until=? WHERE id=? AND lock_until<?').bind(lease, 'main', now).run();
  if (lock.meta.changes !== 1) throw new Error('TickTick сейчас обновляется. Попробуй через несколько секунд.');
  let reserved = false;
  try {
    const token = await decrypt(c.secret_cipher);
    const path = '/project/' + encodeURIComponent(PSK_PROJECT_ID) + '/task/' + encodeURIComponent(task.ticktick.id);
    const read = async (): Promise<any> => tickRequest(token, path);
    const source = await read();
    if (source) guardSource(source);
    const prior = await database().prepare('SELECT operation_id,status,occurrence FROM psk_task_completions WHERE operation_id=? OR (remote_task_id=? AND occurrence=?) LIMIT 1')
      .bind(body.operationId, task.ticktick.id, body.occurrence).first<{ operation_id: string; status: string; occurrence: string }>();
    if (prior) {
      if (prior.occurrence !== body.occurrence) throw new Error('Повтор запроса относится к другой карточке. Обнови страницу.');
      if (source?.status === 2 || (source?.repeatFlag && sourceOccurrence(source) !== body.occurrence)) {
        await mergeConfirmed(source);
        await database().prepare('UPDATE psk_task_completions SET status=?,updated_at=? WHERE operation_id=?').bind('verified', new Date().toISOString(), prior.operation_id).run();
        return { ok: true, alreadyComplete: true, advanced: !!source.repeatFlag && source.status !== 2, ...await taskList(false) };
      }
      if (prior.status === 'verified' && !source) return { ok: true, alreadyComplete: true, ...await taskList(false) };
      throw new Error('Предыдущее выполнение ещё проверяется. Повторно в TickTick не отправляю; обнови список и проверь карточку.');
    }
    if (!source) throw new Error('Карточка недоступна в TickTick. Галочку не меняю без подтверждения.');
    if (source.status === 2) {
      await mergeConfirmed(source);
      return { ok: true, alreadyComplete: true, ...await taskList(false) };
    }
    if (!body.occurrence || sourceOccurrence(source) !== body.occurrence) throw new Error('Карточка изменилась в TickTick. Обнови список перед закрытием.');
    const stamp = new Date().toISOString();
    await database().prepare('INSERT INTO psk_task_completions(operation_id,remote_task_id,occurrence,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .bind(body.operationId, source.id, body.occurrence, 'submitting', stamp, stamp).run();
    reserved = true;
    const verified = await performCompletion({
      source, expectedOccurrence: body.occurrence, read,
      list: () => tickRequest(token, '/project/' + encodeURIComponent(PSK_PROJECT_ID) + '/data'),
      write: async () => {
        const response = await fetch('https://api.ticktick.com/open/v1' + path + '/complete', {
          method: 'POST', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(25000),
        });
        if (response.status === 401 || response.status === 403) throw new Error('Подключению TickTick не хватает права закрывать задачи. Галочка не сохранена.');
        if (!response.ok) throw new Error('TickTick не подтвердил закрытие. Галочка не сохранена; проверь список перед повтором.');
        await database().prepare('UPDATE psk_task_completions SET status=?,updated_at=? WHERE operation_id=?').bind('accepted', new Date().toISOString(), body.operationId).run();
      },
    });
    await mergeConfirmed(verified.source);
    await database().prepare('UPDATE psk_task_completions SET status=?,updated_at=? WHERE operation_id=?').bind('verified', new Date().toISOString(), body.operationId).run();
    return { ok: true, advanced: !!verified.advanced, ...await taskList(false) };
  } catch (e) {
    if (reserved) await database().prepare('UPDATE psk_task_completions SET status=CASE WHEN status=? THEN status ELSE ? END,updated_at=? WHERE operation_id=?')
      .bind('verified', 'uncertain', new Date().toISOString(), body.operationId).run();
    throw e;
  } finally {
    await database().prepare('UPDATE ticktick_connection SET lock_until=0 WHERE id=? AND lock_until=?').bind('main', lease).run();
  }
}
