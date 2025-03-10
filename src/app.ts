import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import connectToDatabase from "@utils/db";
import routes from "./routes";
import { errorHandler } from "./middleware/globalErrorHandler";
import { Logger } from "@utils/logger";

dotenv.config();

async function startServer() {
  try {
    await connectToDatabase();

    const app = express();
    const PORT = process.env.PORT || 3000;

    setupMiddlewares(app);

    setupRoutes(app);

    app.use(errorHandler);

    app.listen(PORT, () => {
      Logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    Logger.error("Failed to start server", error as Error);
    process.exit(1);
  }
}

function setupMiddlewares(app: express.Application) {
  app.use(
    cors({
      origin: process.env.CLIENT_URL as string,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());
}

function setupRoutes(app: express.Application) {
  app.use("/api", routes);
}

startServer();