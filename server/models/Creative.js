import mongoose from 'mongoose';

export const STATUSES = ['draft', 'in_review', 'changes', 'approved'];

const fileSchema = new mongoose.Schema({
  pathname: { type: String, required: true },   // private Vercel Blob pathname
  contentType: String,
  size: Number,
  name: String,
}, { _id: false });

const creativeSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  kind: { type: String, enum: ['image', 'carousel', 'video'], required: true },
  source: { type: String, enum: ['studio', 'import'], default: 'studio' },
  files: [fileSchema],                                   // image: 1, carousel: cards in order, video: 1
  duration: Number,
  ai: { type: mongoose.Schema.Types.Mixed, default: {} },   // AI reading per part: { "0": {...} } or { f0: {...}, end: {...} }
  tags: { type: mongoose.Schema.Types.Mixed, default: null },
  tagsBy: { type: String, enum: ['person', 'ai', 'auto', null], default: null },
  headlineText: { type: String, default: '' },
  hash: String,
  metrics: { type: mongoose.Schema.Types.Mixed, default: null },   // spend, impressions, clicks, leads, ql, sv
  perfName: String,
  qcManual: { type: mongoose.Schema.Types.Mixed, default: {} },
  qcVisual: String,
  transcript: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: STATUSES, default: 'draft' },
  statusBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  statusAt: Date,
  extra: { type: mongoose.Schema.Types.Mixed, default: {} },   // imported records keep their other fields here
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, minimize: false });
creativeSchema.index({ project: 1, name: 1 });

export const Creative = mongoose.models.Creative || mongoose.model('Creative', creativeSchema);
