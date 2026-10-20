import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameKey: {
      type: String,
      required: true,
      
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    phoneDigits: {
      type: String,
      required: true,
      
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

contactSchema.index({ ownerId: 1, nameKey: 1 }, { unique: true });
contactSchema.index({ ownerId: 1, phoneDigits: 1 }, { unique: true });

const Contact = mongoose.model('Contact', contactSchema);

export default Contact;