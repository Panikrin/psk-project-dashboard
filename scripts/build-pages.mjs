import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const output=path.resolve(option('--output','docs'));
const apiOrigin=option('--api-origin','https://psk-project-dashboard.denis-panikrin.chatgpt.site');
if(!['https://psk-project-dashboard.denis-panikrin.chatgpt.site','http://127.0.0.1:5173'].includes(apiOrigin))throw Error('Unexpected API origin');
const bridge=`<script>
window.pskPages=(()=>{
 const api=${JSON.stringify(apiOrigin)},base=new URL('.',location.href).pathname,key='psk-team-session:'+api;
 const read=()=>{try{return sessionStorage.getItem(key)||'';}catch{return '';}};
 const save=token=>{if(!/^[a-f0-9]{64}$/.test(token))throw Error('Не удалось подтвердить вход.');sessionStorage.setItem(key,token);};
 const clear=()=>{try{sessionStorage.removeItem(key);}catch{}};
 async function request(input,init={}){const relative=String(input);if(!relative.startsWith('/api/'))throw Error('Unexpected API path');const headers=new Headers(init.headers),token=read();if(token)headers.set('Authorization','Bearer '+token);return fetch(api+relative,{cache:'no-store',...init,headers,credentials:'omit',redirect:'error'});}
 return {api,base,read,save,clear,request};
})();
const pskFetch=(...args)=>pskPages.request(...args);
</script>`;
let dashboard=await fs.readFile('app/dashboard.html','utf8');
const original=await fs.readFile('app/login/route.ts','utf8');
const start=original.indexOf('const html=')+11,end=original.indexOf('</html>`;',start)+8;
let login=vm.runInNewContext(original.slice(start,end));
function assets(html){return html.replaceAll("url('/fonts/","url('./fonts/").replaceAll('href="/favicon.svg"','href="./favicon.svg"');}
function inject(html){return html.replace('<script>',bridge+'<script>');}
login=assets(login).replaceAll('fetch(','pskFetch(').replace("location.assign('/dashboard')","pskPages.save(d.sessionToken);location.assign(pskPages.base+'dashboard.html')")
 .replace('href="/signin-with-chatgpt?return_to=%2Fsettings"','href="'+apiOrigin+'/signin-with-chatgpt?return_to=%2Fsettings"');
login=inject(login);
dashboard=assets(dashboard).replaceAll('fetch(','pskFetch(').replaceAll("location.assign('/login')","pskPages.clear();location.assign(pskPages.base+'index.html')")
 .replace("location.assign(authRole==='owner'?'/signout-with-chatgpt?return_to=%2Flogin':'/login')","pskPages.clear();location.assign(pskPages.base+'index.html')")
 .replaceAll('href="/settings"','href="'+apiOrigin+'/settings" target="_blank" rel="noopener noreferrer"');
dashboard=inject(dashboard).replace(bridge,bridge+`<script>if(!pskPages.read())location.replace(pskPages.base+'index.html');</script>`);
const media=`<script>
(()=>{
 const images=new Map();
 async function media(path){if(!images.has(path))images.set(path,(async()=>{const r=await pskFetch(path);if(!r.ok)throw Error('Не удалось открыть файл.');return URL.createObjectURL(await r.blob());})().catch(e=>{images.delete(path);throw e;}));return images.get(path);}
 function hydrate(){for(const img of document.querySelectorAll('img[src^="/api/media?"]')){const path=img.getAttribute('src');img.removeAttribute('src');media(path).then(url=>{if(img.isConnected)img.src=url;}).catch(()=>{img.alt='Не удалось загрузить изображение';});}}
 new MutationObserver(hydrate).observe(document.body,{childList:true,subtree:true});hydrate();
 document.addEventListener('click',e=>{const link=e.target.closest('a[href^="/api/media?"]');if(!link)return;e.preventDefault();const win=window.open('about:blank','_blank');if(win)win.opener=null;media(link.getAttribute('href')).then(url=>{if(win)win.location.replace(url);else{const a=document.createElement('a');a.href=url;a.download=link.textContent.trim()||'file';a.click();}}).catch(err=>{if(win)win.close();alert(err.message);});},true);
})();
</script>`;
dashboard=dashboard.replace('</body>',media+'</body>');
for(const html of [login,dashboard])for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
await fs.mkdir(output,{recursive:true});
await Promise.all([fs.writeFile(path.join(output,'index.html'),login),fs.writeFile(path.join(output,'login.html'),login),fs.writeFile(path.join(output,'dashboard.html'),dashboard),fs.writeFile(path.join(output,'.nojekyll'),''),fs.copyFile('public/favicon.svg',path.join(output,'favicon.svg')),fs.cp('public/fonts',path.join(output,'fonts'),{recursive:true})]);
console.log('GitHub Pages interface built:',output);
