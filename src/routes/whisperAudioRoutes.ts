import { RequestHandler, Router } from "express";
import WhisperController from "../controllers/WhisperController";
import upload from "../config/multer";
import { multerErrorHandler } from "../middleware/uploadErrorHandler";


const router = Router();

router.post("/audio/transcribe", upload.single("audio"), multerErrorHandler, WhisperController.transcribeAudio as RequestHandler);

export default router;
