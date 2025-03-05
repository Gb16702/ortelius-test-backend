import { RequestHandler, Router } from "express";
import ChatController from "../controllers/ChatController";

const router = Router();

router.post("/ai-chat", ChatController.handleChat.bind(ChatController) as RequestHandler);

export default router;
