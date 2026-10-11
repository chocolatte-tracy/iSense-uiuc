import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RouteRequest } from '@workspace/campus-routing/proxy';
import type { ServerResponse } from 'node:http';
import { createPublicPeerLimiter } from './public-routing';

const cookieName = 'isense_route_client';
const lifetime = 15 * 60 * 1000;

// Anonymous, server-signed, short-lived client identifier; not an account or auth.
// Origin headers are not authentication. A separate peer limit and the durable
// global budget still apply if an attacker clears/rotates this cookie.
export function createPublicClientLimiter(secret: string, now = Date.now) {
  const allowClient = createPublicPeerLimiter(now, 3, 1024);
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
  return (req: RouteRequest, res: ServerResponse): boolean => {
    const header = req.headers.cookie;
    const raw = typeof header === 'string' && header.length <= 4096
      ? header.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) : undefined;
    let id: string | undefined;
    if (raw && /^[0-9a-f]{32}\.\d{13}\.[0-9a-f]{64}$/.test(raw)) {
      const [candidate, expires, signature] = raw.split('.');
      const expiry = Number(expires);
      if (expiry > now() && expiry <= now() + lifetime
        && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(`${candidate}.${expires}`), 'hex'))) id = candidate;
    }
    if (!id) {
      id = randomBytes(16).toString('hex');
      const value = `${id}.${now() + lifetime}`;
      res.setHeader('Set-Cookie', `${cookieName}=${value}.${sign(value)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=900`);
    }
    return allowClient(id);
  };
}
