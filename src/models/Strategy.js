const mongoose = require('mongoose');

const { Schema } = mongoose;

const legSchema = new Schema(
  {
    side: { type: String, enum: ['B', 'S'], required: true },
    optionType: { type: String, enum: ['CE', 'PE'], required: true },
    expiry: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    strike: { type: Number, required: true, min: 1 },
    lots: { type: Number, required: true, min: 1, max: 500 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const strategySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    underlying: { type: String, required: true, uppercase: true },
    kind: { type: String, enum: ['saved', 'draft'], default: 'saved' },
    multiplier: { type: Number, default: 1, min: 1, max: 50 },
    legs: {
      type: [legSchema],
      validate: [(legs) => legs.length > 0 && legs.length <= 12, 'A strategy needs 1 to 12 legs'],
    },
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

strategySchema.index({ user: 1, kind: 1, updatedAt: -1 });

module.exports = mongoose.model('Strategy', strategySchema);
