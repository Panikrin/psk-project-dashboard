export function isPagesOrigin(origin: string | null): boolean {
  return origin === 'https://panikrin.github.io' ||
    (import.meta.env.DEV && origin === 'http://127.0.0.1:5180');
}
export function trustedRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (isPagesOrigin(origin)) return true;
  return request.headers.get('sec-fetch-site') !== 'cross-site' &&
    (!origin || origin === new URL(request.url).origin);
}
export function sessionToken(headers: {get(name: string): string | null}): string | null {
  const authorization = headers.get('authorization');
  const token = authorization !== null ? authorization.match(/^Bearer ([a-f0-9]{64})$/)?.[1] :
    (headers.get('cookie') || '').split(';').map(s => s.trim())
      .find(s => s.startsWith('__Host-psk-session='))?.slice('__Host-psk-session='.length);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
