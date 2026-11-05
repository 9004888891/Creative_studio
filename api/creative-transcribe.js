// POST /api/creative-transcribe: speech-to-text for video voiceovers. Needs TRANSCRIBE_API_KEY (optional feature).
import transcribe from '../server/transcribe.cjs';
import auth from '../server/vercel-auth.cjs';
export default auth.requireUser(transcribe.createTranscribeHandler());
