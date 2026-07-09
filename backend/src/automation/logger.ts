export class AutomationLogger {
  private logs: string[] = [];

  constructor() {}

  private formatTime(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  public info(message: string): void {
    const logLine = `[INFO] ${this.formatTime()} - ${message}`;
    this.logs.push(logLine);
    console.log(logLine);
  }

  public error(message: string): void {
    const logLine = `[ERROR] ${this.formatTime()} - ${message}`;
    this.logs.push(logLine);
    console.error(logLine);
  }

  public getLogs(): string {
    return this.logs.join('\n');
  }

  public clear(): void {
    this.logs = [];
  }
}
