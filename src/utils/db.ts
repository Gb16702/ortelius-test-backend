import mongoose, { ConnectOptions } from "mongoose";
import dotenv from "dotenv";
import { Logger } from "./logger";

dotenv.config();

interface DatabaseConfig {
  uri: string;
  attempts: number;
  delay: number;
  options?: ConnectOptions;
}

export async function connectToDatabase(config?: Partial<DatabaseConfig>): Promise<void> {
  const databaseConfig: DatabaseConfig = {
    uri: config?.uri ?? (process.env.MONGODB_URI as string),
    options: config?.options ?? {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
    attempts: config?.attempts ?? 3,
    delay: config?.delay ?? 3000,
  };

  if (!databaseConfig.uri) {
    const error = new Error("MongoDB URI isn't provided");
    Logger.error("Failed to connect to database", error);
    throw error;
  }

  let attempt = 0;

  while (attempt < databaseConfig.attempts) {
    try {
      attempt++;

      Logger.info(`Connecting to database. Attempt ${attempt}/${databaseConfig.attempts}...`);
      await mongoose.connect(databaseConfig.uri, databaseConfig.options);

      mongoose.connection.on("error", err => {
        Logger.error("MongoDB connection error", err);
      });

      mongoose.connection.on("disconnected", () => {
        Logger.info("MongoDB disconnected");
      });

      Logger.info("Successfully connected to database");
      return;
    } catch (error) {
      Logger.error(`MongoDB connection attempt ${attempt} failed`, error as Error);

      if (attempt > databaseConfig.attempts) {
        throw new Error(`Failed to connect to database after ${databaseConfig.attempts} attempts`);
      }

      Logger.info(`Retrying in ${databaseConfig.delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, databaseConfig.delay));
    }
  }

  throw new Error("Failed to connect to database");
}

export default connectToDatabase;
