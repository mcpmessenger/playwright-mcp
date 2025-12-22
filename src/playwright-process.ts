/**
 * Manages the Playwright MCP process lifecycle via STDIO
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

export interface ProcessMessage {
  id: string | number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export class PlaywrightProcessManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private pendingMessages: Map<string | number, ProcessMessage> = new Map();
  private messageIdCounter: number = 0;
  private buffer: string = "";
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Get or create the Playwright MCP process
   */
  private async getProcess(): Promise<ChildProcess> {
    if (this.process && !this.process.killed) {
      return this.process;
    }

    return this.startProcess();
  }

  /**
   * Start a new Playwright MCP process
   */
  private startProcess(): ChildProcess {
    // Kill existing process if any
    if (this.process) {
      this.process.kill();
    }

    console.log("[Playwright process] Starting Playwright MCP process...");
    // Spawn the Playwright MCP process
    // Use --isolated flag to allow multiple concurrent browser operations
    // Set environment variables to ensure Playwright can find browsers
    const proc = spawn("npx", ["-y", "@playwright/mcp@latest", "--isolated"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || undefined,
      },
    });

    this.process = proc;
    console.log("[Playwright process] Process spawned with PID:", proc.pid);

    // Handle stdout - accumulate JSON-RPC messages
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      // Log raw output for debugging (first 200 chars)
      if (text.length > 0) {
        console.log("[Playwright stdout]", text.substring(0, Math.min(200, text.length)).replace(/\n/g, "\\n"));
      }
      this.buffer += text;
      this.processBuffer();
    });

    // Handle stderr - log for debugging
    proc.stderr?.on("data", (data: Buffer) => {
      const message = data.toString();
      // Filter out Playwright download messages which are noisy but not errors
      if (!message.includes("Downloading") && !message.includes("Installing")) {
        console.error("[Playwright stderr]", message.trim());
      } else {
        console.log("[Playwright stderr]", message.trim());
      }
    });

    // Handle process exit
    proc.on("exit", (code, signal) => {
      console.log(`[Playwright process] Exited with code ${code}, signal ${signal}`);
      this.process = null;
      this.isInitialized = false;
      this.emit("exit", { code, signal });

      // Reject all pending messages
      for (const [id, msg] of this.pendingMessages.entries()) {
        msg.reject(new Error(`Process exited before response (code: ${code})`));
        if (msg.timeout) clearTimeout(msg.timeout);
      }
      this.pendingMessages.clear();
    });

    // Handle process errors
    proc.on("error", (error) => {
      console.error("[Playwright process] Error:", error);
      this.emit("error", error);
    });

    return proc;
  }

  /**
   * Process the stdout buffer, extracting complete JSON-RPC messages
   */
  private processBuffer(): void {
    // JSON-RPC messages are typically newline-delimited JSON
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed);
        this.handleMessage(message);
      } catch (error) {
        // Skip invalid JSON (might be part of a multi-line message or log output)
        console.warn("[Playwright process] Failed to parse message:", trimmed);
      }
    }
  }

  /**
   * Handle incoming JSON-RPC message from the process
   */
  private handleMessage(message: any): void {
    // Handle responses to our requests
    if (message.id !== undefined && this.pendingMessages.has(message.id)) {
      const pending = this.pendingMessages.get(message.id)!;
      this.pendingMessages.delete(message.id);
      if (pending.timeout) clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(
          new Error(message.error.message || "Unknown error")
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    // Handle notifications (no id)
    if (message.method) {
      this.emit("notification", message);
    }
  }

  /**
   * Initialize the MCP connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const proc = await this.getProcess();

      // Give the process a moment to start up
      await new Promise(resolve => setTimeout(resolve, 1000));

      const initRequest = {
        jsonrpc: "2.0" as const,
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "playwright-mcp-http-server",
            version: "1.0.0",
          },
        },
      };

      try {
        console.log("[MCP] Sending initialize request...");
        // Send initialize message directly without calling sendMessage to avoid circular dependency
        const result = await this.sendMessageInternal(initRequest);
        console.log("[MCP] Initialize response received:", JSON.stringify(result).substring(0, 200));
        // Send initialized notification
        const initializedNotification = {
          jsonrpc: "2.0" as const,
          method: "notifications/initialized",
        };
        this.sendRawMessage(initializedNotification);
        this.isInitialized = true;
        console.log("[MCP] Initialized successfully");
      } catch (error) {
        console.error("[MCP] Initialization failed:", error);
        throw error;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Send a JSON-RPC message and wait for response (internal, doesn't check initialization)
   */
  private async sendMessageInternal(request: any): Promise<any> {
    const proc = await this.getProcess();
    const id = request.id !== undefined ? request.id : ++this.messageIdCounter;
    request.id = id;

    return new Promise((resolve, reject) => {
      // Set timeout (30 seconds default)
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id);
        reject(new Error("Request timeout"));
      }, 30000);

      this.pendingMessages.set(id, { id, resolve, reject, timeout });
      this.sendRawMessage(request);
    });
  }

  /**
   * Send a JSON-RPC message and wait for response
   */
  async sendMessage(request: any): Promise<any> {
    // Ensure initialized (but don't call if we're already initializing)
    if (!this.isInitialized && !this.initPromise) {
      await this.initialize();
    } else if (this.initPromise) {
      // Wait for initialization to complete
      await this.initPromise;
    }

    return this.sendMessageInternal(request);
  }

  /**
   * Send a raw message without waiting for response (for notifications)
   */
  private sendRawMessage(message: any): void {
    const proc = this.process;
    if (!proc || proc.killed) {
      throw new Error("Process is not running");
    }

    if (!proc.stdin || proc.stdin.destroyed) {
      throw new Error("Process stdin is not available");
    }

    const json = JSON.stringify(message) + "\n";
    console.log("[Playwright process] Sending message:", JSON.stringify(message).substring(0, 200));
    proc.stdin.write(json, (error) => {
      if (error) {
        console.error("[Playwright process] Error writing to stdin:", error);
      }
    });
  }

  /**
   * Kill the process
   */
  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isInitialized = false;
      this.initPromise = null;
    }
  }

  /**
   * Check if process is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}

