export class AppError extends Error {
  public readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string): AppError {
    return new AppError(message, 400);
  }

  static forbidden(message: string): AppError {
    return new AppError(message, 403);
  }

  static internal(message: string): AppError {
    return new AppError(message, 500);
  }

  static notFound(message: string): AppError {
    return new AppError(message, 404);
  }

  static unauthorized(message: string): AppError {
    return new AppError(message, 401);
  }

  static resourceExhausted(message: string): AppError {
    return new AppError(message, 429);
  }
}
