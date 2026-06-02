// server/middleware/auth.js
import { clerkClient } from "@clerk/express";
import Subscription from "../model/Subscription.js";


// Middleware to check userId and subscription status
export const auth = async (req, res, next) => {
    try {
        // ✅ Use req.auth() as a function (not req.auth)
        const authObj = await req.auth();
        const { userId } = authObj;
        const hasPremiumPlan = await authObj.has({ plan: 'premium' });

        const user = await clerkClient.users.getUser(userId);
        
        const activeSubscription = await Subscription.findOne({
            userId,
            status: 'active',
            endDate: { $gt: new Date() }
        });

        const isPremium = hasPremiumPlan || (activeSubscription && activeSubscription.plan === 'pro');
        
        if (!isPremium && user.privateMetadata?.free_usage !== undefined) {
            req.free_usage = user.privateMetadata.free_usage || 0;
        } else if (isPremium) {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: { free_usage: 0 }
            });
            req.free_usage = 0;
        } else {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: { free_usage: 0 }
            });
            req.free_usage = 0;
        }
        
        req.plan = isPremium ? 'premium' : 'free';
        req.userId = userId;
        req.subscription = activeSubscription;
        
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ success: false, message: error.message });
    }
};



// Middleware to check if user has premium access for specific features
export const requirePremium = (feature) => {
    return async (req, res, next) => {
        try {
            const isPremium = req.plan === 'premium';
            
            if (!isPremium) {
                // Check free usage limits
                const freeLimit = getFreeLimit(feature);
                if (req.free_usage >= freeLimit) {
                    return res.status(403).json({ 
                        success: false, 
                        message: `Free limit reached for ${feature}. Upgrade to premium for unlimited access.`,
                        requiresUpgrade: true
                    });
                }
                
                // Increment free usage
                await clerkClient.users.updateUserMetadata(req.userId, {
                    privateMetadata: {
                        free_usage: (req.free_usage || 0) + 1
                    }
                });
                req.free_usage += 1;
            }
            
            next();
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    };
};

function getFreeLimit(feature) {
    const limits = {
        'article': 10,
        'blog-title': 20,
        'image': 0,      // Premium only
        'background-removal': 0,  // Premium only
        'object-removal': 0,      // Premium only
        'resume-review': 0        // Premium only
    };
    return limits[feature] || 0;
}