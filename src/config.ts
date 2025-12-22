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
  authToken?: string;
  authSecretName?: string;
  enableAuth: boolean;
  // Security settings
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  requestTimeoutMs?: number;
  maxConcurrentBrowsers?: number;
  allowedDomains?: string[];
}

/**
 * Load configuration from environment variables with defaults
 */
export function loadConfig(): Config {
  const authToken = process.env.AUTH_TOKEN;
  const authSecretName = process.env.AUTH_SECRET_NAME;
  const enableAuth = !!(authToken || authSecretName);

  // Parse allowed domains from comma-separated string
  const allowedDomains = process.env.ALLOWED_DOMAINS
    ? process.env.ALLOWED_DOMAINS.split(",").map((d) => d.trim()).filter(Boolean)
    : undefined;

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
    authToken,
    authSecretName,
    enableAuth,
    // Security settings with defaults
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
      : 15 * 60 * 1000, // 15 minutes
    rateLimitMax: process.env.RATE_LIMIT_MAX
      ? parseInt(process.env.RATE_LIMIT_MAX, 10)
      : 100, // 100 requests per window
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS
      ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
      : 30000, // 30 seconds
    maxConcurrentBrowsers: process.env.MAX_CONCURRENT_BROWSERS
      ? parseInt(process.env.MAX_CONCURRENT_BROWSERS, 10)
      : 5,
    allowedDomains,
  };
}

export const config = loadConfig();
