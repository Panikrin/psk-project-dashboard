import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../app/dashboard.html',import.meta.url),'utf8').trim();
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
fs.writeFileSync(new URL('../app/dashboard-html.ts',import.meta.url),'export const dashboardHtml = '+JSON.stringify(html)+';\n');
console.log('Dashboard embedded.');
