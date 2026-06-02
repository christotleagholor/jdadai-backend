// server/routes/subscriptionRoutes.js
import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { clerkClient, requireAuth } from '@clerk/express'; // ✅ Add clerkClient here
import Subscription from '../model/Subscription.js';

const router = express.Router();

// Plan configurations with multi-currency support
const PLANS = {
  free: {
    name: 'Free Plan',
    price: 0,
    features: [
      'AI Article Writer (10 articles/month)',
      'Blog Title Generator (20 titles/month)',
      'Basic support'
    ],
    limits: {
      articles: 10,
      blogTitles: 20,
      images: 0,
      backgroundRemoval: 0,
      objectRemoval: 0,
      resumeReviews: 0
    }
  },
  pro: {
    name: 'Pro Plan',
    price: 10,
    features: [
      'Unlimited AI Article Writer',
      'Unlimited Blog Title Generator',
      'Unlimited Resume Reviewer',
      'AI Image Generation (50 images/month)',
      'Background Removal (30 images/month)',
      'Object Removal (20 images/month)',
      'Priority support',
      'API access'
    ],
    limits: {
      articles: -1,
      blogTitles: -1,
      resumeReviews: -1,
      images: 50,
      backgroundRemoval: 30,
      objectRemoval: 20,      
    }
  }
};

// Supported currencies
const SUPPORTED_CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar', rate: 1 },
  GBP: { symbol: '£', name: 'British Pound', rate: 0.79 },
  EUR: { symbol: '€', name: 'Euro', rate: 0.93 },
  NGN: { symbol: '₦', name: 'Nigerian Naira', rate: 1500 },
  GHS: { symbol: '₵', name: 'Ghanaian Cedi', rate: 15.5 },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling', rate: 130 },
  ZAR: { symbol: 'R', name: 'South African Rand', rate: 18.5 },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', rate: 1.35 },
  AUD: { symbol: 'A$', name: 'Australian Dollar', rate: 1.52 }
};

// Exchange rates cache
let exchangeRatesCache = {
  rates: null,
  lastUpdated: null
};

// Fetch live exchange rates
async function fetchExchangeRates() {
  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    
    exchangeRatesCache = {
      rates: response.data.rates,
      lastUpdated: new Date()
    };
    
    return response.data.rates;
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);
    if (exchangeRatesCache.rates) {
      return exchangeRatesCache.rates;
    }
    return {
      USD: 1,
      GBP: 0.79,
      EUR: 0.93,
      NGN: 1500,
      GHS: 15.5,
      KES: 130,
      ZAR: 18.5,
      CAD: 1.35,
      AUD: 1.52
    };
  }
}

// Get current exchange rates
router.get('/exchange-rates', async (req, res) => {
  try {
    const rates = await fetchExchangeRates();
    res.json({
      success: true,
      rates,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      lastUpdated: exchangeRatesCache.lastUpdated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get plan details
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: PLANS,
    currencies: SUPPORTED_CURRENCIES
  });
});

// Get user's current subscription
router.get('/my-subscription', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    
    const subscription = await Subscription.findOne({ 
      userId, 
      status: 'active' 
    }).sort({ createdAt: -1 });
    
    if (!subscription) {
      return res.json({
        success: true,
        subscription: {
          plan: 'free',
          status: 'active',
          features: PLANS.free.features,
          limits: PLANS.free.limits,
          usage: {
            articles: 0,
            blogTitles: 0,
            images: 0,
            backgroundRemoval: 0,
            objectRemoval: 0,
            resumeReviews: 0
          }
        }
      });
    }
    
    if (subscription.isExpired()) {
      subscription.status = 'expired';
      await subscription.save();
      
      return res.json({
        success: true,
        subscription: {
          plan: 'free',
          status: 'expired',
          features: PLANS.free.features,
          limits: PLANS.free.limits,
          previousPlan: subscription.plan
        }
      });
    }
    
    res.json({
      success: true,
      subscription: {
        id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        features: PLANS[subscription.plan].features,
        limits: PLANS[subscription.plan].limits
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize subscription payment
router.post('/initialize-payment', requireAuth(), async (req, res) => {
  try {
    const { plan, currency = 'USD', returnUrl, phone } = req.body;
    const userId = req.auth.userId;
    
    // Get user info from Clerk
    const user = await clerkClient.users.getUser(userId);
    const userEmail = user.emailAddresses?.[0]?.emailAddress;
    const userName = user.fullName || user.firstName || 'Customer';
    
    console.log('Payment initialization:', { plan, currency, userId, userEmail });
    
    if (!PLANS[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }
    
    const amount = PLANS[plan].price;
    const convertedAmount = amount * (SUPPORTED_CURRENCIES[currency]?.rate || 1);
    
    // Generate unique transaction reference
    const txRef = `JDAI-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    
    // Create pending subscription
    const subscription = new Subscription({
      userId,
      plan,
      status: 'pending',
      flutterwaveReference: txRef,
      amount: convertedAmount,
      currency,
      startDate: new Date(),
      endDate,
      features: PLANS[plan].features
    });
    
    await subscription.save();
    
    // Flutterwave payload
    const payload = {
      tx_ref: txRef,
      amount: Number(convertedAmount),
      currency: currency,
      redirect_url: returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing`,
      payment_options: 'card,mobilemoney,ussd,banktransfer',
      customer: {
        email: userEmail,
        name: userName,
        phonenumber: phone || '08000000000'
      },
      customizations: {
        title: 'Jdad AI Subscription',
        description: `${PLANS[plan].name} - Monthly Subscription`,
        logo: `https://i.ibb.co/xSV23fYg/logo.png`
      },
      meta: {
        userId: userId,
        plan: plan,
        subscriptionId: subscription._id.toString()
      }
    };
    
    console.log('Flutterwave payload:', payload);
    
    // Check if Flutterwave secret key is set
    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
      console.error('FLUTTERWAVE_SECRET_KEY is not set in environment variables');
      return res.status(500).json({ 
        success: false, 
        message: 'Payment configuration error. Please contact support.' 
      });
    }
    
    // Initialize payment with Flutterwave
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Flutterwave response:', response.data);
    
    res.json({
      success: true,
      data: {
        paymentLink: response.data.data.link,
        transactionReference: txRef,
        subscriptionId: subscription._id
      }
    });
    
  } catch (error) {
    console.error('Payment initialization error:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      message: error.response?.data?.message || error.message || 'Payment initialization failed'
    });
  }
});

// Webhook for Flutterwave
router.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    const signature = req.headers['verif-hash'];
    if (signature !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    
    if (event === 'charge.completed') {
      const { tx_ref, status, amount, currency, customer, transaction_id, flw_ref } = data;
      
      const subscription = await Subscription.findOne({ flutterwaveReference: tx_ref });
      
      if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription not found' });
      }
      
      if (status === 'successful') {
        if (subscription.amount !== amount || subscription.currency !== currency) {
          subscription.status = 'failed';
          subscription.paymentDetails = { error: 'Amount/Currency mismatch', data };
          await subscription.save();
          return res.json({ success: false, message: 'Amount mismatch' });
        }
        
        subscription.status = 'active';
        subscription.transactionId = transaction_id;
        subscription.paymentDetails = {
          flw_ref,
          customer,
          transaction_id,
          completedAt: new Date()
        };
        
        await subscription.save();
        
        // Update Clerk metadata
        await clerkClient.users.updateUserMetadata(subscription.userId, {
          publicMetadata: { 
            subscriptionPlan: subscription.plan, 
            subscriptionEnd: subscription.endDate,
            isPremium: true
          }
        });
        
      } else {
        subscription.status = 'failed';
        subscription.paymentDetails = { error: 'Payment failed', status, data };
        await subscription.save();
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verify payment
router.post('/verify-payment', async (req, res) => {
  try {
    const { transactionReference, transactionId } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({ success: false, message: 'Transaction ID is required' });
    }
    
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
        }
      }
    );
    
    const { data } = response.data;
    
    if (data.status === 'successful') {
      const subscription = await Subscription.findOne({ flutterwaveReference: transactionReference });
      
      if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription not found' });
      }
      
      subscription.status = 'active';
      subscription.transactionId = data.id;
      subscription.paymentDetails = data;
      await subscription.save();
      
      // Update Clerk metadata
      await clerkClient.users.updateUserMetadata(subscription.userId, {
        publicMetadata: { 
          subscriptionPlan: subscription.plan, 
          subscriptionEnd: subscription.endDate,
          isPremium: true
        }
      });
      
      // Reset free usage for premium users
      await clerkClient.users.updateUserMetadata(subscription.userId, {
        privateMetadata: {
          free_usage: 0
        }
      });
      
      res.json({
        success: true,
        subscription: {
          id: subscription._id,
          plan: subscription.plan,
          status: subscription.status,
          endDate: subscription.endDate
        }
      });
    } else {
      res.json({ success: false, message: 'Payment not successful' });
    }
    
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel subscription
router.post('/cancel', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    
    const subscription = await Subscription.findOne({ 
      userId, 
      status: 'active' 
    });
    
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'No active subscription found' });
    }
    
    subscription.status = 'cancelled';
    await subscription.save();
    
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: {
        subscriptionPlan: 'free',
        isPremium: false
      }
    });
    
    res.json({ success: true, message: 'Subscription cancelled' });
    
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check feature access
router.post('/check-access', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { feature } = req.body;
    
    const subscription = await Subscription.findOne({ 
      userId, 
      status: 'active' 
    });
    
    let plan = 'free';
    let limits = PLANS.free.limits;
    
    if (subscription && !subscription.isExpired()) {
      plan = subscription.plan;
      limits = PLANS[plan].limits;
    }
    
    let hasAccess = false;
    
    switch(feature) {
      case 'articles':
        hasAccess = plan === 'pro' || limits.articles !== 0;
        break;
      case 'blogTitles':
        hasAccess = plan === 'pro' || limits.blogTitles !== 0;
        break;
      case 'images':
        hasAccess = plan === 'pro';
        break;
      case 'backgroundRemoval':
        hasAccess = plan === 'pro';
        break;
      case 'objectRemoval':
        hasAccess = plan === 'pro';
        break;
      case 'resumeReviews':
        hasAccess = plan === 'pro';
        break;
      default:
        hasAccess = true;
    }
    
    res.json({
      success: true,
      hasAccess,
      plan,
      limits
    });
    
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;