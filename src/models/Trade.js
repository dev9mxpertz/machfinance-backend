const mongoose = require('mongoose');

const { Schema } = mongoose;

const tradeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tradingSymbol: { type: String, required: true },
    underlying: { type: String, required: true, uppercase: true },
    exchange: { type: String, enum: ['NSE', 'BSE'], default: 'NSE' },
    segment: { type: String, enum: ['FO', 'EQ'], required: true },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    expiry: String,
    orderId: { type: String, required: true },
    tradeId: { type: String, required: true, unique: true },
    tradedAt: { type: Date, required: true },
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

tradeSchema.index({ user: 1, tradedAt: -1 });
tradeSchema.index({ user: 1, segment: 1, underlying: 1, tradedAt: -1 });

module.exports = mongoose.model('Trade', tradeSchema);
