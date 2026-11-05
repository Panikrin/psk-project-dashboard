export const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>toHex(crypto.getRandomValues(new Uint8Array(32)));
export async function sha256(text){return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));}
export async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return toHex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256)));}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
