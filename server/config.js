// Settings from the environment, checked once. A missing required setting stops the API with a clear message
// instead of failing later in a confusing way.
const env = process.env;
const list = v => String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export const config = {
  production: env.NODE_ENV === 'production' || !!env.VERCEL,
  mongoUri: env.MONGODB_URI || '',
  jwtSecret: env.JWT_SECRET || '',
  appUrl: (env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:5173')).replace(/\/$/, ''),
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  setupKey: env.SETUP_KEY || '',
  googleDomains: list(env.GOOGLE_ALLOWED_DOMAINS),
  sessionDays: Number(env.SESSION_DAYS || 7),
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 200),
  features: {
    ai: !!env.ANTHROPIC_API_KEY,
    transcribe: !!env.TRANSCRIBE_API_KEY,
    performance: !!(env.PERF_SOURCE_URL && env.PERF_API_TOKEN),
    uploads: !!env.BLOB_READ_WRITE_TOKEN,
    google: !!env.GOOGLE_CLIENT_ID,
  },
};

/** What is missing for the API to run safely; empty when all is well. */
export function configProblems() {
  const p = [];
  if (!config.mongoUri) p.push('MONGODB_URI is not set.');
  if (!config.jwtSecret || config.jwtSecret.length < 32) p.push('JWT_SECRET must be set to a random string of at least 32 characters.');
  return p;
}
