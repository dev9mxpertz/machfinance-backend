const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

const nomineeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    relation: { type: String, required: true, trim: true },
    sharePct: { type: Number, min: 0, max: 100, required: true },
  },
  { _id: false },
);

const bankSchema = new Schema(
  {
    bankName: { type: String, required: true },
    accountNumberMasked: { type: String, required: true },
    ifsc: { type: String, required: true },
    primary: { type: Boolean, default: false },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true, select: false },
    totpSecret: { type: String, required: true, select: false },
    lastTotpCounter: { type: Number, default: 0, select: false },
    // Optional fixed code for QA/test accounts. Only accepted when ALLOW_STATIC_TOTP=true.
    staticTotpHash: { type: String, select: false },
    lastLoginAt: Date,

    clientId: { type: String, required: true, unique: true },
    supportCode: { type: String, required: true },
    ckycNumber: { type: String, required: true },
    accountType: { type: String, default: 'Personal Account' },
    status: { type: String, enum: ['active', 'suspended', 'closed'], default: 'active' },

    mobile: { type: String, required: true, match: [/^\+91\d{10}$/, 'Invalid mobile number'] },
    pan: { type: String, required: true, uppercase: true },
    panVerified: { type: Boolean, default: false },
    dateOfBirth: { type: Date, required: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },

    funds: {
      // Capital deposited into the trading account (INR)
      deposited: { type: Number, default: 0, min: 0 },
      // Profit / loss realised from closed positions (INR)
      realisedPnl: { type: Number, default: 0 },
    },

    nominees: [nomineeSchema],
    bankAccounts: [bankSchema],
    demat: {
      depository: String,
      dpId: String,
      boId: String,
    },
    segments: [
      {
        _id: false,
        name: String,
        enabled: Boolean,
      },
    ],
    marginTrading: {
      enabled: { type: Boolean, default: false },
      limit: { type: Number, default: 0 },
    },
    documents: [
      {
        _id: false,
        name: String,
        status: { type: String, enum: ['verified', 'pending', 'rejected'] },
        uploadedAt: Date,
      },
    ],
    commodityDeclaration: {
      category: String,
      declaredAt: Date,
    },
    family: [
      {
        _id: false,
        name: String,
        relation: String,
        clientId: String,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.totpSecret;
        delete ret.lastTotpCounter;
        delete ret.staticTotpHash;
        return ret;
      },
    },
  },
);

userSchema.virtual('initials').get(function initials() {
  return this.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
});

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toSessionUser = function toSessionUser() {
  return {
    id: this.id,
    name: this.name,
    initials: this.initials,
    email: this.email,
    clientId: this.clientId,
  };
};

module.exports = mongoose.model('User', userSchema);
