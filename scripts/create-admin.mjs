// Create (or promote) an admin straight in the database, without the web setup page.
//   MONGODB_URI=... npm run create-admin -- admin@company.com "Full Name"
// The password is read from ADMIN_PASSWORD, or a strong one is generated and shown once.
import './env.mjs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../server/models/User.js';

const [email, ...nameParts] = process.argv.slice(2);
if (!email || !/^\S+@\S+\.\S+$/.test(email)) { console.error('Usage: npm run create-admin -- you@company.com "Your Name"'); process.exit(1); }
if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI first (in .env or the environment).'); process.exit(1); }
const given = process.env.ADMIN_PASSWORD, password = given || crypto.randomBytes(15).toString('base64url');
if (password.length < 10) { console.error('ADMIN_PASSWORD must be at least 10 characters.'); process.exit(1); }

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const em = email.trim().toLowerCase(), hash = await bcrypt.hash(password, 12);
const u = await User.findOneAndUpdate({ email: em }, { $set: { email: em, role: 'admin', active: true, passwordHash: hash, projects: [] , ...(nameParts.length ? { name: nameParts.join(' ') } : {}) }, $inc: { tokenVersion: 1 } }, { upsert: true, new: true });
console.log(`Admin ready: ${u.email}`);
if (!given) console.log(`Password (shown once, change it after signing in): ${password}`);
await mongoose.disconnect();
