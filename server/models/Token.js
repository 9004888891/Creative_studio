import mongoose from 'mongoose';

// One-time links: invitations and password resets. Only a hash of the token is stored; links expire on their own.
const tokenSchema = new mongoose.Schema({
  kind: { type: String, enum: ['invite', 'reset'], required: true },
  hash: { type: String, required: true, unique: true },
  email: { type: String, lowercase: true, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: String,
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  hideBudget: Boolean,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt: { type: Date, required: true },
  usedAt: Date,
}, { timestamps: true });
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Token = mongoose.models.Token || mongoose.model('Token', tokenSchema);
