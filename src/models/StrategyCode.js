const mongoose = require('mongoose');

const { Schema } = mongoose;

const strategyCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    version: { type: String, required: true, trim: true, maxlength: 20 },
    filename: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    content: { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.content;
        return ret;
      },
    },
  },
);

strategyCodeSchema.index({ user: 1, title: 1, version: 1 }, { unique: true });
strategyCodeSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('StrategyCode', strategyCodeSchema);
