import mongoose, { Document, Schema } from 'mongoose';

export interface ITrafficLog extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  month: number;   // 1-12
  year: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  lastUpdated: Date;
}

const TrafficLogSchema = new Schema<ITrafficLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    bytesUploaded: {
      type: Number,
      default: 0,
    },
    bytesDownloaded: {
      type: Number,
      default: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound index - one record per user per month/year
TrafficLogSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.models.TrafficLog ||
  mongoose.model<ITrafficLog>('TrafficLog', TrafficLogSchema);
