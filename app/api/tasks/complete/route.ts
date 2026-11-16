export const dynamic = 'force-dynamic';
import { z } from 'zod';
import { json, sameOrigin } from '../../../../lib/ticktick';
import { tasksAllowed, completeTask } from '../../../../lib/psk-tasks';
const input = z.object({ id: z.number().int().positive(), occurrence: z.string().min(1).max(1000), operationId: z.string().uuid() }).strict();
export async function POST(request: Request) {
  if (!await tasksAllowed(request)) return json({ error: 'Войди по паролю команды.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Запрос с другого сайта запрещён.' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Ожидается JSON.' }, 415);
  try {
    const raw = await request.text();
    if (raw.length > 2000) return json({ error: 'Слишком большой запрос.' }, 413);
    const parsed = input.safeParse(JSON.parse(raw));
    if (!parsed.success) return json({ error: 'Обнови страницу и выбери задачу заново.' }, 400);
    return json(await completeTask(parsed.data));
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Не удалось подтвердить выполнение.' }, 409); }
}
