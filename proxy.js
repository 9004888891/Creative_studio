// Runs before every request on Vercel: nothing on the site (pages, scripts, API) is served until the person signs in.
// Sign-in details come from STUDIO_PASSWORD or STUDIO_USERS (see server/vercel-auth.cjs). With neither set, the
// site stays closed, so client data is never exposed by a missing setting.
import { next } from '@vercel/functions';
import auth from './server/vercel-auth.cjs';

export default function proxy(request) {
  if (!auth.configured()) return new Response('Creative Studio is not open yet: add STUDIO_PASSWORD (or STUDIO_USERS) in Vercel → Settings → Environment Variables, then redeploy.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (!auth.userFromHeader(request.headers.get('authorization'))) return new Response('Sign in to open Creative Studio.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Creative Studio", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' } });
  return next();
}
