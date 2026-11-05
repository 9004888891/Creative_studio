import mongoose from 'mongoose';

// Failed sign-ins, counted per email and per address for 15 minutes, so password guessing is slowed down even
// when requests land on different serverless instances.
const schema = new mongoose.Schema({ key: { type: String, required: true, unique: true }, count: { type: Number, default: 0 }, expiresAt: { type: Date, required: true } });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginAttempt = mongoose.models.LoginAttempt || mongoose.model('LoginAttempt', schema);
