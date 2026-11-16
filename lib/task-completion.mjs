import { guardSource, sourceOccurrence } from './task-list.mjs';

// The source write occurs once. A lost/ambiguous response is verified by GET,
// never retried by another POST (especially important for recurring tasks).
export async function performCompletion({ source, expectedOccurrence, write, read, list }) {
  guardSource(source);
  if (source.status === 2) return { source, alreadyComplete: true };
  if (sourceOccurrence(source) !== expectedOccurrence) throw new Error('Срок или повтор задачи изменился в TickTick. Обнови список и проверь карточку.');
  await write();
  const after = await read();
  if (after) {
    guardSource(after);
    if (after.status === 2) return { source: after, alreadyComplete: false };
    if (source.repeatFlag && sourceOccurrence(after) !== expectedOccurrence) return { source: after, advanced: true };
    throw new Error('TickTick ещё не подтвердил выполнение. Обнови список; повторно закрывать задачу пока не нужно.');
  }
  // The documented completion response is the acknowledgement. Some completed
  // cards are no longer returned by the individual lookup. Require both its 404
  // and its absence in a successfully fetched project; a missing list alone is
  // never interpreted as completion.
  const project = await list();
  const next = project.tasks.find(t => t.id === source.id);
  if (next) {
    if (source.repeatFlag && sourceOccurrence(next) !== expectedOccurrence) return { source: next, advanced: true };
    if (next.status === 2) return { source: next };
    throw new Error('Задача пока остаётся открытой в TickTick. Проверь её перед повторным действием.');
  }
  if (source.repeatFlag) throw new Error('TickTick принял выполнение, но следующий повтор ещё не подтверждён. Обнови список позже.');
  return { source: { ...source, status: 2 }, acknowledged: true };
}
