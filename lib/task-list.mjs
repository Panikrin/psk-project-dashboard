export const PSK_PROJECT_ID = '67e5a8caebae7c0000002254';
export const ASSIGNEES = Object.freeze({
  '123381554': '@denis_mos_government',
  '125735485': '@isaevaoa95',
  '128400732': '@CaliforniaBrul',
});
export function taskCategory(task) {
  if (task.repeat || task.repeatFlag) return 'regular';
  const title = String(task.title || '');
  return /BRIZO/i.test(title) && /(?:уточнить|обновить|проверить).*(?:статус|актуальность)|следующ(?:ий|его) шаг|зафиксировать/i.test(title) ? 'sales' : 'work';
}
export function taskProject(task) {
  if (taskCategory(task) === 'regular') return 'Регулярные задачи';
  const title = String(task.title || '');
  for (const [pattern, name] of [
    [/омега/i, 'Омега Плаза'], [/ангелов/i, 'Ангелово'],
    [/новогорск/i, 'Новогорск'], [/казаков/i, 'ЖК Казаков'],
    [/красногорск/i, 'Красногорск'], [/старопетров/i, 'Старопетровский проезд'],
  ]) if (pattern.test(title)) return name;
  return task.project && !['Задачи PSK', 'ПСК', 'Регулярные задачи'].includes(task.project) ? task.project : 'Общие задачи';
}
export function sourceOwner(task) {
  if (Object.hasOwn(task, 'assignee')) return task.assignee == null ? '' : ASSIGNEES[String(task.assignee)] || '';
  return (String(task.title || '').match(/@[a-zA-Z0-9_]+/) || [])[0] || '';
}
export function sourceOccurrence(task) {
  // Raw source values, not the local board's editable date, identify a recurrence.
  return JSON.stringify([task.id, task.projectId, task.dueDate || '', task.startDate || '', task.repeatFlag || '']);
}
export function guardSource(task) {
  if (!task || task.projectId !== PSK_PROJECT_ID || task.kind === 'NOTE' || task.deleted) throw new Error('Эта карточка не относится к рабочим задачам ПСК.');
}
