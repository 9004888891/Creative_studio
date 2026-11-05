// GET /api/creative-performance?project=…&from=…&to=…: ad results relayed from Realty Funnel Desk.
// Needs PERF_SOURCE_URL and PERF_API_TOKEN. People only get projects they may see.
import perf from '../server/performance-proxy.cjs';
import auth from '../server/vercel-auth.cjs';
export default auth.requireUser(perf.createPerformanceProxy({ allowProject: (req, project) => auth.mayProject(req.studioUser, project) }));
