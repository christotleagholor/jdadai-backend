import Creations from "../model/Creations.js";

export const getUserCreations = async (req,res) => {
    try {
        const {userId} =req.auth();

        const creations = await Creations.find({user_id:userId}).sort({createdAt:-1});

        res.json({success:true,creations});       
    } catch (error) {
        res.json({success:false,message:error.message})
    }
}

export const getPublishedCreations = async (req,res) => {
    try {
        const creations = await Creations.find({publish:true}).sort({createdAt:-1});
        res.json({success:true,creations});
    } catch (error) {
        res.json({success:false,message:error.message})
    }
}

export const toggleLikeCreation = async (req,res) => {
    try {
        const {userId} =req.auth();
        const {id} =req.body;        

        const creation = await Creations.findById(id);

        if(!creation){
            res.json({success:false,message:"Creation not found"})
        }
        const currentLikes = creation.likes

        const userIdStr = userId.toString();
        let updatedLikes;
        let message;

        if(currentLikes.includes(userIdStr)){
            updatedLikes = currentLikes.filter((user)=>user!==userIdStr);
            message = 'Creation Unliked';
        } else {
            updatedLikes = [...currentLikes,userIdStr]
            message = 'Craetion Liked';
        }

        await Creations.findByIdAndUpdate(id,{likes:updatedLikes});

        res.json({success:true,message});       
    } catch (error) {
        res.json({success:false,message:error.message})
    }
}


export const getFreeUsage = async (req, res) => {
    try {
        const { userId } = req.auth();
        const user = await clerkClient.users.getUser(userId);
        
        const freeUsage = user.privateMetadata?.free_usage || 0;
        
        res.json({ success: true, usage: freeUsage });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

export const incrementFreeUsage = async (req, res) => {
    try {
        const { userId } = req.auth();
        const user = await clerkClient.users.getUser(userId);
        
        const currentUsage = user.privateMetadata?.free_usage || 0;
        const newUsage = currentUsage + 1;
        
        await clerkClient.users.updateUserMetadata(userId, {
            privateMetadata: { free_usage: newUsage }
        });
        
        res.json({ success: true, usage: newUsage });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};
