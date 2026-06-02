// server/routes/userRoutes.js (add these new routes)
import express from "express";
import { auth } from "../middleware/auth.js";
import { 
    getPublishedCreations, 
    getUserCreations, 
    toggleLikeCreation,
    getFreeUsage,
    incrementFreeUsage
} from "../controller/userController.js";

const userRouter = express.Router();

userRouter.get('/get-user-creations', auth, getUserCreations);
userRouter.get('/get-published-creations', auth, getPublishedCreations);
userRouter.post('/toggle-like-creation', auth, toggleLikeCreation);
userRouter.get('/free-usage', auth, getFreeUsage);
userRouter.post('/increment-free-usage', auth, incrementFreeUsage);

export default userRouter;