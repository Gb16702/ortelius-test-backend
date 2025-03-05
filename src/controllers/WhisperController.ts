import fs from "fs";
import { Request, Response, NextFunction } from "express";
import { OpenAI } from "openai";
import { AppError } from "../errors/AppError";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class WhisperController {
  public transcribeAudio = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      return next(AppError.badRequest("Audio file is required"));
    }

    try {
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(req.file.path),
        model: "whisper-1",
        temperature: 0.2,
      });

      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.json({ text: response.text });
    } catch (error) {
      console.error("Transcription error : ", error);
      return next(AppError.internal("Error processing audio transcription"));
    }
  };
}

export default new WhisperController();
