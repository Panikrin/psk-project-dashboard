export const dynamic = "force-dynamic";
import { getSiteUser } from '../../lib/site-auth';
import { dashboardHtml } from '../dashboard-html';
export async function GET(request: Request) {
  if (!await getSiteUser()) return Response.redirect(new URL('/login',request.url));
  return new Response(dashboardHtml, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src https://drive.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.openai.com",
  }});
}
