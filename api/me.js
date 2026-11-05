// GET /api/me: who is signed in and what they may do (the page uses it to set permissions).
import auth from '../server/vercel-auth.cjs';
export default auth.requireUser((req, res) => {
  const u = req.studioUser; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ user: u.user, role: u.role, projects: u.projects, hideBudget: u.hideBudget,
    features: { ai: !!process.env.ANTHROPIC_API_KEY, transcribe: !!process.env.TRANSCRIBE_API_KEY, performance: !!(process.env.PERF_SOURCE_URL && process.env.PERF_API_TOKEN) } }));
});
