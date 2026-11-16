export const dynamic = 'force-dynamic';
import html from '../tasks-html';
export async function GET() {
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
