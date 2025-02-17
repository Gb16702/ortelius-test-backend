import express from "express";
import chatRoutes from "./routes/chatRoutes";
import userRoutes from "./routes/userRoutes";
import weatherRoutes from "./routes/weatherRoutes";
import whisperAudioRoutes from "./routes/whisperAudioRoutes";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import "../utils/db";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL as string,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api", chatRoutes);
app.use("/api", userRoutes);
app.use("/api", weatherRoutes);
app.use("/api", whisperAudioRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
