import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 160 },
  developer: { type: String, trim: true, maxlength: 160, default: '' },
  // The project brief (see BRIEF_FIELDS in studio/src/brief.js): what the checks compare against and ideas are written from.
  brief: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Details the studio learned or was given about the project (kept with the library).
  facts: { type: mongoose.Schema.Types.Mixed, default: {} },
  archived: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, minimize: false });

export const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
