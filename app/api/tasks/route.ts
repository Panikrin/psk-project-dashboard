export const dynamic = 'force-dynamic';
import { json } from '../../../lib/ticktick';
import { tasksAllowed, taskList } from '../../../lib/psk-tasks';
export async function GET(request: Request) {
  if (!await tasksAllowed(request)) return json({ error: 'Войди по паролю команды.' }, 401);
  try { return json(await taskList()); }
  catch { return json({ error: 'Не удалось прочитать список. Попробуй обновить страницу.' }, 503); }
}
