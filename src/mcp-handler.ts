/**
 * MCP Protocol Handler - bridges HTTP requests to Playwright MCP process
 */

import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
} from "./types/mcp";
import { PlaywrightProcessManager } from "./playwright-process";

export class MCPHandler {
  private processManager: PlaywrightProcessManager;

  constructor() {
    this.processManager = new PlaywrightProcessManager();
  }

  /**
   * Handle an MCP JSON-RPC request
   */
  async handle(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      // Validate JSON-RPC version
      if (request.jsonrpc !== "2.0") {
        return this.errorResponse(
          request.id,
          -32600,
          "Invalid Request",
          "jsonrpc must be '2.0'"
        );
      }

      // Validate request structure
      if (!request.method) {
        return this.errorResponse(
          request.id,
          -32600,
          "Invalid Request",
          "method is required"
        );
      }

      // Handle the request
      const result = await this.processManager.sendMessage(request);

      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error: any) {
      console.error("[MCP Handler] Error:", error);
      return this.errorResponse(
        request.id,
        -32603,
        "Internal Error",
        error.message || "Unknown error"
      );
    }
  }

  /**
   * Create an error response
   */
  private errorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: any
  ): JSONRPCResponse {
    const error: JSONRPCError = {
      code,
      message,
    };
    if (data) {
      error.data = data;
    }

    return {
      jsonrpc: "2.0",
      id,
      error,
    };
  }

  /**
   * Initialize the MCP connection (called once at startup)
   */
  async initialize(): Promise<void> {
    try {
      await this.processManager.initialize();
      console.log("[MCP Handler] Initialized");
    } catch (error) {
      console.error("[MCP Handler] Initialization error:", error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.processManager.kill();
  }

  /**
   * Check if the handler is ready
   */
  isReady(): boolean {
    return this.processManager.isRunning();
  }
}

