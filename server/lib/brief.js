// The project brief fields the server accepts (mirrors BRIEF_FIELDS in studio/src/brief.js).
import { z } from 'zod';

const str = (n = 400) => z.string().trim().max(n).optional().default('');
export const briefSchema = z.object({
  project: str(160), developer: str(160), location: str(160), micro: str(160),
  configs: z.array(z.object({ type: z.string().trim().max(80).default(''), price: z.string().trim().max(80).default('') })).max(20).optional().default([]),
  priceRange: str(120), usps: str(1000), offer: str(400), rera: str(120), reraState: str(80), website: str(300), possession: str(80),
  audience: str(400), visualType: z.enum(['', 'render', 'actual', 'stock', 'ai', 'mixed']).optional().default(''), disclaimer: str(2000),
  logoZone: z.enum(['', 'top-left', 'top-right', 'bottom-left', 'bottom-right']).optional().default(''), script: str(5000), festival: str(80),
  mustInclude: str(2000), mustNot: str(2000),
}).strip();
