/**
 * Configuration management with environment variable support
 */

export interface Config {
  port: number;
  playwrightBrowser: string;
  playwrightHeadless: boolean;
  logLevel: string;
  maxSessions?: number;
  sessionTimeout?: number;
  corsOrigin?: string;
}

/**
 * Load configuration from environment variables with defaults
 */
export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || "8931", 10),
    playwrightBrowser: process.env.PLAYWRIGHT_BROWSER || "chromium",
    playwrightHeadless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    logLevel: process.env.LOG_LEVEL || "info",
    maxSessions: process.env.MAX_SESSIONS
      ? parseInt(process.env.MAX_SESSIONS, 10)
      : undefined,
    sessionTimeout: process.env.SESSION_TIMEOUT
      ? parseInt(process.env.SESSION_TIMEOUT, 10)
      : undefined,
    corsOrigin: process.env.CORS_ORIGIN || "*",
  };
}

export const config = loadConfig();

