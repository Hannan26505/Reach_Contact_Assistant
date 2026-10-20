import mongoose from 'mongoose';

const recoveryCodeSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
      unique: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const RecoveryCode = mongoose.model('RecoveryCode', recoveryCodeSchema);

export default RecoveryCode;