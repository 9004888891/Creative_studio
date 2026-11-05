import crypto from 'crypto';
import { Token } from '../models/Token.js';
import { config } from '../config.js';

export const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Create a one-time link (invite or password reset). Returns the full URL to share. */
export async function makeLink(kind, fields, hours) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await Token.create(Object.assign({ kind, hash: sha(raw), expiresAt: new Date(Date.now() + hours * 36e5) }, fields));
  return `${config.appUrl}/${kind === 'invite' ? 'invite' : 'reset'}/${raw}`;
}

/** Find a valid, unused link by its raw token. */
export const findLink = (kind, raw) => Token.findOne({ kind, hash: sha(raw), usedAt: null, expiresAt: { $gt: new Date() } });
