import fs from 'node:fs';
import vm from 'node:vm';
let html=fs.readFileSync(new URL('../app/dashboard.html',import.meta.url),'utf8').trim();
html=html.replace(/\/\* PSK_COMMERCE_CSS_START \*\/[\s\S]*?\/\* PSK_COMMERCE_CSS_END \*\//,'/* PSK_COMMERCE_CSS_START */\n'+fs.readFileSync(new URL('../app/commercial-ui.css',import.meta.url),'utf8')+'\n/* PSK_COMMERCE_CSS_END */');
html=html.replace(/\/\* PSK_COMMERCE_JS_START \*\/[\s\S]*?\/\* PSK_COMMERCE_JS_END \*\//,()=> '/* PSK_COMMERCE_JS_START */\n'+fs.readFileSync(new URL('../app/commercial-ui.js',import.meta.url),'utf8')+'\n/* PSK_COMMERCE_JS_END */');
fs.writeFileSync(new URL('../app/dashboard.html',import.meta.url),html+'\n');
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
fs.writeFileSync(new URL('../app/dashboard-html.ts',import.meta.url),'export const dashboardHtml = '+JSON.stringify(html)+';\n');
console.log('Dashboard embedded.');
