// One MongoDB connection, reused across requests (and across warm serverless invocations).
import mongoose from 'mongoose';
import { config } from './config.js';

mongoose.set('strictQuery', true);
let cached = globalThis.__csMongo || (globalThis.__csMongo = { conn: null, promise: null });

export async function connectDb() {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(config.mongoUri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000, autoIndex: true })
      .then(m => { cached.conn = m; return m; })
      .catch(e => { cached.promise = null; throw e; });
  }
  return cached.promise;
}
