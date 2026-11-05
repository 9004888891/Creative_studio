// POST /api/creative-analyze: the AI reading of a creative. Needs ANTHROPIC_API_KEY.
import analyze from '../server/analyze.cjs';
import auth from '../server/vercel-auth.cjs';
export default auth.requireUser(analyze.createAnalyzeHandler());
