export class Logger {
  static info(message: string, metadata?: Record<string, any>): void {
    console.log(`[INFO] ${message}`, metadata ?? "");
  }

  static error(message: string, error?: Error): void {
    console.error(`[ERROR] ${message}`, error ?? "");
  }
}
