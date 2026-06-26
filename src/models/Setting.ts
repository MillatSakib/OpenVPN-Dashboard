import mongoose, { Document, Schema } from 'mongoose';

export interface ISetting extends Document {
  billingCycleStartDay: number;
  createdAt: Date;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    billingCycleStartDay: {
      type: Number,
      default: 1,
      min: 1,
      max: 31,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Setting ||
  mongoose.model<ISetting>('Setting', SettingSchema);
