import { Router } from "express";
import chatRoutes from "./chatRoutes";
import userRoutes from "./userRoutes";
import whisperAudioRoutes from "./whisperAudioRoutes";

const router = Router();

router.use(chatRoutes);
router.use(userRoutes);
router.use(whisperAudioRoutes);

export default router;