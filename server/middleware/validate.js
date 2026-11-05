// Request validation with zod: the handler only ever sees clean, typed input.
import { bad } from './errors.js';

export const validate = (schema, where = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[where] || {});
  if (!r.success) { const i = r.error.issues[0]; return next(bad(`${i.path.join('.') || 'Input'}: ${i.message}`)); }
  if (where === 'query') req.valid = r.data; else req[where] = r.data;
  next();
};
