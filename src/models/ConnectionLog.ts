import mongoose, { Document, Schema } from 'mongoose';

export interface IConnectionLog extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  connectedAt: Date;
  disconnectedAt?: Date;
  bytesReceived: number;
  bytesSent: number;
  virtualIp?: string;
  realIp?: string;
}

const ConnectionLogSchema = new Schema<IConnectionLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: { type: String, required: true },
    connectedAt: { type: Date, required: true },
    disconnectedAt: { type: Date },
    bytesReceived: { type: Number, default: 0 },
    bytesSent: { type: Number, default: 0 },
    virtualIp: { type: String },
    realIp: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.ConnectionLog ||
  mongoose.model<IConnectionLog>('ConnectionLog', ConnectionLogSchema);
