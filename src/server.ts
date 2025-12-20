/**
 * Express HTTP Server for Playwright MCP
 */

import express, { Request, Response, ErrorRequestHandler } from "express";
import cors from "cors";
import { config } from "./config";
import { MCPHandler } from "./mcp-handler";
import { JSONRPCRequest } from "./types/mcp";

const app = express();
const mcpHandler = new MCPHandler();

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// Root endpoint - Service information
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Playwright MCP HTTP Server",
    version: "1.0.0",
    protocol: "MCP v0.1",
    endpoints: {
      mcp: "/mcp",
      health: "/health",
    },
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

// Main MCP protocol endpoint
app.post("/mcp", async (req: Request, res: Response) => {
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

    // Start HTTP server
    app.listen(config.port, () => {
      console.log(
        `[Server] Playwright MCP HTTP Server running on port ${config.port}`
      );
      console.log(`[Server] Health check: http://localhost:${config.port}/health`);
      console.log(`[Server] MCP endpoint: http://localhost:${config.port}/mcp`);
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

