import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { sha256,equal } from './password-crypto.mjs';
import { sessionToken,isPagesOrigin } from './client-origin';
export async function getOwner(){if(isPagesOrigin((await headers()).get('origin')))return null;const user=await getChatGPTUser();if(!user||!env.DB)return null;const row=await env.DB.prepare('SELECT owner_id FROM ticktick_connection WHERE id=?').bind('main').first<{owner_id:string}>();return row?.owner_id===user.userId?{...user,role:'owner' as const}:null;}
export async function getSiteUser(){const owner=await getOwner();if(owner)return owner;const h=await headers(),token=sessionToken(h);if(!token||!/^[a-f0-9]{64}$/.test(token)||!env.DB)return null;const row=await env.DB.prepare('SELECT s.expires_at FROM team_sessions s JOIN team_auth a ON a.id=? AND a.version=s.auth_version WHERE s.id_hash=? AND s.expires_at>?').bind('main',await sha256(token),Date.now()).first();return row?{userId:'team',displayName:'Команда ПСК',email:'',fullName:null,role:'team' as const}:null;}
export async function serviceAllowed(request:Request){const token=request.headers.get('X-PSK-Sync-Key');return !!env.PSK_SERVICE_SYNC_KEY&&!!token&&equal(token,env.PSK_SERVICE_SYNC_KEY);}
export const cookieName='__Host-psk-session';
