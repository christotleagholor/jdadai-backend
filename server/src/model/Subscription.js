import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  plan: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'pending'],
    default: 'pending'
  },
  flutterwaveReference: {
    type: String,
    unique: true,
    sparse: true
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  features: [{
    type: String
  }],
  paymentDetails: {
    type: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update updatedAt on save
subscriptionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && new Date() < this.endDate;
};

// Method to check if subscription is expired
subscriptionSchema.methods.isExpired = function() {
  return new Date() > this.endDate;
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;