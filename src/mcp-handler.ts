/**
 * MCP Protocol Handler - bridges HTTP requests to Playwright MCP process
 * Enhanced with Visual Sensor Skill capabilities: accessibility snapshots, PII redaction, elicitation, and skills
 */

import { EventEmitter } from "events";
import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
} from "./types/mcp";
import { PlaywrightProcessManager } from "./playwright-process";
import { ToolInterceptor } from "./tool-interceptor";
import { config } from "./config";

export class MCPHandler extends EventEmitter {
  private processManager: PlaywrightProcessManager;
  private toolInterceptor: ToolInterceptor;
  private activeOperations: number = 0;
  private maxConcurrentOperations: number = 5;

  constructor(maxConcurrentOperations: number = 5) {
    super();
    this.processManager = new PlaywrightProcessManager();
    this.maxConcurrentOperations = maxConcurrentOperations;
    
    // Create tool interceptor with PII redaction enabled
    this.toolInterceptor = new ToolInterceptor(this.processManager, {
      piiRedactionEnabled: true,
    });
    
    // Forward notifications from process manager and tool interceptor to SSE clients
    this.processManager.on("notification", (notification) => {
      this.emit("notification", notification);
    });
    
    this.toolInterceptor.on("notification", (notification) => {
      this.emit("notification", notification);
    });
  }

  /**
   * Handle an MCP JSON-RPC request
   */
  async handle(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // Check if we've hit the max concurrent operations limit
    if (this.activeOperations >= this.maxConcurrentOperations) {
      console.warn(
        `[MCP Handler] Maximum concurrent operations (${this.maxConcurrentOperations}) reached. Request rejected.`
      );
      return this.errorResponse(
        request.id,
        -32603,
        "Internal Error",
        `Maximum concurrent browser operations (${this.maxConcurrentOperations}) reached. Please try again later.`
      );
    }

    this.activeOperations++;
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

      // Handle the request through tool interceptor (which adds custom tools and post-processing)
      const response = await this.toolInterceptor.handle(request);
      return response;
    } catch (error: any) {
      console.error("[MCP Handler] Error:", error);
      return this.errorResponse(
        request.id,
        -32603,
        "Internal Error",
        error.message || "Unknown error"
      );
    } finally {
      this.activeOperations--;
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
    await this.toolInterceptor.cleanup();
    this.processManager.kill();
  }

  /**
   * Check if the handler is ready
   */
  isReady(): boolean {
    return this.processManager.isRunning();
  }
}

