const mongoose = require('mongoose');

const { Schema } = mongoose;

const codeRunSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    code: { type: Schema.Types.ObjectId, ref: 'StrategyCode', required: true },
    mode: { type: String, enum: ['paper', 'live'], required: true },
    initialCapital: { type: Number, required: true, min: 10000 },
    params: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['completed', 'failed'], required: true },
    metrics: {
      finalCapital: Number,
      netPnl: Number,
      returnPct: Number,
      trades: Number,
      winRatePct: Number,
      maxDrawdownPct: Number,
    },
    equityCurve: [{ _id: false, date: String, value: Number }],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

codeRunSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('CodeRun', codeRunSchema);
