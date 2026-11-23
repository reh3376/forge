import { SeedConfig } from "../config";

export class SeedLogger {
  private config: SeedConfig;
  private startTime: number;

  constructor(config: SeedConfig) {
    this.config = config;
    this.startTime = Date.now();
  }

  private shouldLog(level: string): boolean {
    const levels = ["debug", "info", "warn", "error"];
    const configLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= configLevelIndex;
  }

  private formatMessage(
    level: string,
    module: string,
    message: string
  ): string {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    return `[${timestamp}] [${level.toUpperCase()}] [${module}] [+${elapsed}ms] ${message}`;
  }

  debug(module: string, message: string): void {
    if (this.shouldLog("debug")) {
      console.log(this.formatMessage("debug", module, message));
    }
  }

  info(module: string, message: string): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", module, message));
    }
  }

  warn(module: string, message: string): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", module, message));
    }
  }

  error(module: string, message: string): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", module, message));
    }
  }

  success(module: string, message: string): void {
    console.log(`✅ ${this.formatMessage("info", module, message)}`);
  }

  failure(module: string, message: string): void {
    console.error(`❌ ${this.formatMessage("error", module, message)}`);
  }

  progress(
    module: string,
    current: number,
    total: number,
    message?: string
  ): void {
    const percentage = ((current / total) * 100).toFixed(1);
    const progressBar = this.createProgressBar(current, total, 20);
    const msg = message ? ` - ${message}` : "";
    console.log(
      `[${module}] ${progressBar} ${percentage}% (${current}/${total})${msg}`
    );
  }

  private createProgressBar(
    current: number,
    total: number,
    width: number
  ): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${" ".repeat(empty)}]`;
  }

  summary(totalModules: number, successful: number, failed: number): void {
    const elapsedSeconds = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log("\n" + "=".repeat(60));
    console.log("SEED EXECUTION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total modules: ${totalModules}`);
    console.log(`Successful: ${successful} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? "❌" : ""}`);
    console.log(`Execution time: ${elapsedSeconds}s`);
    console.log("=".repeat(60));
  }
}
