import { Logger } from "@utils/logger";
import { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, req, res) => {
  const status = err.status ?? 500;
  const message = err.message ?? "Internal server error";

  Logger.error(`Error ${status}: ${message}`, err);

  res.status(status).json({
    error: message,
  });
};
