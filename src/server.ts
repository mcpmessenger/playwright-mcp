/**
 * Express HTTP Server for Playwright MCP with Streamable-HTTP support
 */

import express, { Request, Response, ErrorRequestHandler } from "express";
import cors from "cors";
import { config } from "./config";
import { MCPHandler } from "./mcp-handler";
import { JSONRPCRequest } from "./types/mcp";
import { createAuthMiddleware } from "./auth-middleware";
import {
  createRateLimitMiddleware,
  createRequestValidationMiddleware,
  createRequestTimeoutMiddleware,
  createRequestLoggingMiddleware,
} from "./security-middleware";

const app = express();
const mcpHandler = new MCPHandler(config.maxConcurrentBrowsers || 5);

// Trust proxy (required for Cloud Run and other reverse proxies)
// This enables proper IP detection for rate limiting
app.set("trust proxy", true);

// Middleware - Order matters!
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "10mb" }));

// Enhanced request logging with IP tracking
app.use(createRequestLoggingMiddleware());

// Rate limiting (applies to all routes except health check)
app.use(createRateLimitMiddleware(config));

// Request timeout middleware
app.use(createRequestTimeoutMiddleware(config));

// Root endpoint - Service information
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Playwright MCP HTTP Server",
    version: "1.0.0",
    protocol: "MCP v0.1 (Streamable-HTTP)",
    endpoints: {
      mcp: "/mcp",
      health: "/health",
    },
    transport: "streamable-http",
  });
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  const isHealthy = mcpHandler.isReady();
  const status = isHealthy ? "healthy" : "starting";

  res.status(isHealthy ? 200 : 503).json({
    status,
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Authentication middleware for MCP endpoints
const authMiddleware = createAuthMiddleware(config);

// Request validation middleware for MCP endpoints
const requestValidationMiddleware = createRequestValidationMiddleware(config);

// Streamable-HTTP GET endpoint (Server-Sent Events)
app.get("/mcp", authMiddleware, async (req: Request, res: Response) => {
  // Check if client wants SSE
  const acceptHeader = req.headers.accept || "";
  if (!acceptHeader.includes("text/event-stream")) {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32600,
        message: "Invalid Request",
        data: "GET /mcp requires Accept: text/event-stream header for Streamable-HTTP",
      },
    });
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Send initial connection message
  res.write(": connected\n\n");
  res.write(`data: ${JSON.stringify({ type: "connection", status: "open" })}\n\n`);

  // Set up notification listener for server-to-client messages
  const notificationHandler = (notification: any) => {
    try {
      res.write(`data: ${JSON.stringify(notification)}\n\n`);
    } catch (error) {
      console.error("[Server] Error writing SSE message:", error);
      cleanup();
    }
  };

  mcpHandler.on("notification", notificationHandler);

  // Handle client disconnect
  req.on("close", () => {
    console.log("[Server] SSE connection closed");
    cleanup();
  });

  req.on("aborted", () => {
    console.log("[Server] SSE connection aborted");
    cleanup();
  });

  function cleanup() {
    mcpHandler.removeListener("notification", notificationHandler);
    if (!res.headersSent || !res.writableEnded) {
      res.end();
    }
  }

  // Keep connection alive with periodic ping
  const pingInterval = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (error) {
      clearInterval(pingInterval);
      cleanup();
    }
  }, 30000); // Ping every 30 seconds

  req.on("close", () => {
    clearInterval(pingInterval);
  });
});

// Main MCP protocol endpoint (POST for client-to-server messages)
app.post("/mcp", authMiddleware, requestValidationMiddleware, async (req: Request, res: Response) => {
  try {
    const request: JSONRPCRequest = req.body;

    // Validate basic structure
    if (!request || typeof request !== "object") {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Invalid Request",
        },
      });
    }

    const response = await mcpHandler.handle(request);
    res.json(response);
  } catch (error: any) {
    console.error("[Server] Error handling request:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Internal Error",
        data: error.message,
      },
    });
  }
});

// Error handling middleware
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  console.error("[Server] Unhandled error:", err);
  res.status(500).json({
    jsonrpc: "2.0",
    id: req.body?.id || null,
    error: {
      code: -32603,
      message: "Internal Error",
      data: err.message,
    },
  });
};

app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path,
  });
});

// Start server
async function startServer() {
  try {
    // Initialize MCP handler
    console.log("[Server] Initializing MCP handler...");
    await mcpHandler.initialize();

    // Log authentication status
    if (config.enableAuth) {
      console.log("[Server] Authentication enabled");
      if (config.authSecretName) {
        console.log(`[Server] Using auth token from Secret Manager: ${config.authSecretName}`);
      } else {
        console.log("[Server] Using auth token from AUTH_TOKEN environment variable");
      }
    } else {
      console.log("[Server] WARNING: Authentication is disabled - service is publicly accessible");
    }

    // Log security configuration
    console.log("[Server] Security Configuration:");
    console.log(`  - Rate limiting: ${config.rateLimitMax || 100} requests per ${Math.ceil((config.rateLimitWindowMs || 15 * 60 * 1000) / 60000)} minutes`);
    console.log(`  - Request timeout: ${config.requestTimeoutMs || 30000}ms`);
    console.log(`  - Max concurrent browsers: ${config.maxConcurrentBrowsers || 5}`);
    if (config.allowedDomains && config.allowedDomains.length > 0) {
      console.log(`  - Allowed domains: ${config.allowedDomains.join(", ")}`);
    } else {
      console.log("  - Allowed domains: All HTTP(S) URLs (no restrictions)");
    }

    // Start HTTP server
    app.listen(config.port, () => {
      console.log(
        `[Server] Playwright MCP HTTP Server running on port ${config.port}`
      );
      console.log(`[Server] Health check: http://localhost:${config.port}/health`);
      console.log(`[Server] MCP endpoint: http://localhost:${config.port}/mcp`);
      console.log(`[Server] Streamable-HTTP: GET /mcp with Accept: text/event-stream`);
      console.log(`[Server] Protocol: POST /mcp for JSON-RPC messages`);
    });
  } catch (error) {
    console.error("[Server] Failed to start:", error);
    process.exit(1);
  }
}

// Graceful shutdown
let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("[Server] Shutting down gracefully...");
  try {
    await mcpHandler.cleanup();
    console.log("[Server] Cleanup complete");
    process.exit(0);
  } catch (error) {
    console.error("[Server] Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[Server] Uncaught exception:", error);
  shutdown();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Server] Unhandled rejection at:", promise, "reason:", reason);
});

// Start the server
startServer();
