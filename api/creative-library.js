// GET/POST /api/creative-library: the shared creative library (elements, results, project details and briefs).
// Kept in Redis (connect Upstash Redis to the project, which sets KV_REST_API_URL and KV_REST_API_TOKEN).
import lib from '../server/library-store.cjs';
import auth from '../server/vercel-auth.cjs';
const store = lib.createLibraryStore({
  storage: lib.storage.redisStorage(),
  canRead: (req, r) => auth.mayProject(req.studioUser, r.project),
  canWrite: req => req.studioUser.role !== 'viewer',
});
export default auth.requireUser(store);
