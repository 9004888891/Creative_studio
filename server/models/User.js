import mongoose from 'mongoose';

export const ROLES = ['admin', 'editor', 'junior', 'viewer'];

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
  name: { type: String, trim: true, maxlength: 120, default: '' },
  passwordHash: { type: String, select: false },
  googleId: { type: String, index: true, sparse: true },
  role: { type: String, enum: ROLES, default: 'viewer' },
  // Projects this person may open. Empty means all projects for admins and editors, none for juniors and viewers.
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  hideBudget: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },   // bump to sign this person out everywhere
  lastLoginAt: Date,
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

userSchema.methods.toPublic = function () {
  return { id: String(this._id), email: this.email, name: this.name, role: this.role, projects: (this.projects || []).map(String), hideBudget: this.hideBudget,
    active: this.active, google: !!this.googleId, lastLoginAt: this.lastLoginAt, createdAt: this.createdAt };
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
