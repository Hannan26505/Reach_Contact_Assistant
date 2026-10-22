import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    lookupPinHash: {
      type: String,
      default: null,
    },
    lookupPinFailedAttempts: {
      type: Number,
      default: 0,
    },
    lookupPinLockedUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

export default User;