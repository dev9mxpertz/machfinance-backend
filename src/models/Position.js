const mongoose = require('mongoose');

const { Schema } = mongoose;

const positionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    batchId: { type: String, required: true },
    strategyName: { type: String, default: 'Custom' },
    underlying: { type: String, required: true, uppercase: true },
    tradingSymbol: { type: String, required: true },
    expiry: { type: String, required: true },
    strike: { type: Number, required: true },
    optionType: { type: String, enum: ['CE', 'PE'], required: true },
    side: { type: String, enum: ['B', 'S'], required: true },
    lots: { type: Number, required: true, min: 1 },
    lotSize: { type: Number, required: true, min: 1 },
    product: { type: String, enum: ['NRML', 'MIS'], default: 'NRML' },
    entryPrice: { type: Number, required: true, min: 0 },
    exitPrice: Number,
    capitalAtEntry: { type: Number, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    openedAt: { type: Date, default: Date.now },
    closedAt: Date,
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

positionSchema.virtual('quantity').get(function quantity() {
  return this.lots * this.lotSize;
});

positionSchema.index({ user: 1, status: 1, underlying: 1 });
positionSchema.index({ user: 1, openedAt: -1 });

module.exports = mongoose.model('Position', positionSchema);
