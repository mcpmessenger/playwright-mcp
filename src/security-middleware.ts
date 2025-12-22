/**
 * Security middleware for rate limiting, request validation, and timeouts
 */

import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { Config } from "./config";
import { validateToolArgs } from "./validation";
import { JSONRPCRequest } from "./types/mcp";

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: Config) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
    max: config.rateLimitMax || 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Custom handler to format JSON-RPC error response
    handler: (req: Request, res: Response) => {
      const requestId = req.body?.id || null;
      const windowMinutes = Math.ceil(
        (config.rateLimitWindowMs || 15 * 60 * 1000) / 60000
      );
      res.status(429).json({
        jsonrpc: "2.0",
        id: requestId,
        error: {
          code: -32002,
          message: "Rate Limit Exceeded",
          data: `Too many requests from this IP, please try again after ${windowMinutes} minutes.`,
        },
      });
    },
    // Use IP from X-Forwarded-For header if behind a proxy (Cloud Run)
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === "/health";
    },
  });
}

/**
 * Request validation middleware - validates tool arguments
 */
export function createRequestValidationMiddleware(config: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only validate POST requests to /mcp
    if (req.method !== "POST" || req.path !== "/mcp") {
      return next();
    }

    const request: JSONRPCRequest = req.body;

    // If it's a tools/call method, validate the arguments
    if (request.method === "tools/call" && request.params) {
      const toolName = request.params.name;
      const toolArgs = request.params.arguments;

      if (!toolName) {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: request.id || null,
          error: {
            code: -32602,
            message: "Invalid Params",
            data: "tools/call requires a 'name' parameter",
          },
        });
      }

      // Validate tool arguments
      const validation = validateToolArgs(
        toolName,
        toolArgs,
        config.allowedDomains
      );

      if (!validation.isValid) {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: request.id || null,
          error: {
            code: -32602,
            message: "Invalid Params",
            data: validation.error || "Invalid tool arguments",
          },
        });
      }
    }

    next();
  };
}

/**
 * Request timeout middleware
 */
export function createRequestTimeoutMiddleware(config: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = config.requestTimeoutMs || 30000; // 30 seconds default

    // Set timeout for the request
    req.setTimeout(timeout, () => {
      if (!res.headersSent) {
        res.status(408).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: "Request Timeout",
            data: `Request exceeded maximum execution time of ${timeout}ms`,
          },
        });
      }
    });

    next();
  };
}

/**
 * Enhanced request logging with IP tracking
 */
export function createRequestLoggingMiddleware() {
  // Track requests per IP for monitoring
  const requestTracker = new Map<string, number>();

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    // Track request count per IP
    const count = requestTracker.get(ip) || 0;
    requestTracker.set(ip, count + 1);

    // Log suspicious activity (more than 1000 requests from same IP)
    if (count > 1000) {
      console.warn(
        `[Security] Suspicious activity detected from IP: ${ip} (${count} requests)`
      );
    }

    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) [IP: ${ip}]`
      );
    });

    next();
  };
}
