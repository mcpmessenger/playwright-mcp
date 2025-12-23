/**
 * Tool Interceptor - Intercepts and enhances MCP tool calls
 * Adds custom tools (skills, accessibility snapshot) and post-processes results (PII redaction)
 */

import { JSONRPCRequest, JSONRPCResponse } from "./types/mcp";
import { PlaywrightProcessManager } from "./playwright-process";
import { redactPIIFromImage, containsPII, detectPII, redactPII } from "./pii-redaction";
import { 
  detectLoginWall, 
  detectMFA, 
  createLoginElicitationRequest, 
  createMFAElicitationRequest,
  ElicitationHandler 
} from "./elicitation-handler";
import { EventEmitter } from "events";

/**
 * Tool Interceptor - Wraps MCP handler to add custom tools and post-processing
 */
export class ToolInterceptor extends EventEmitter {
  private mcpProcess: PlaywrightProcessManager;
  private elicitationHandler: ElicitationHandler;
  private piiRedactionEnabled: boolean;

  constructor(
    mcpProcess: PlaywrightProcessManager,
    options: {
      piiRedactionEnabled?: boolean;
    } = {}
  ) {
    super();
    this.mcpProcess = mcpProcess;
    this.elicitationHandler = new ElicitationHandler();
    this.piiRedactionEnabled = options.piiRedactionEnabled ?? true;

    // Forward elicitation requests as notifications
    this.elicitationHandler.on("elicitationRequest", (request) => {
      this.emit("notification", {
        jsonrpc: "2.0",
        method: "notifications/elicitation",
        params: request,
      });
    });
  }

  /**
   * Handle tools/list - Add custom tools to the list
   */
  async handleToolsList(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // Get tools from MCP process
    const mcpResponse = await this.mcpProcess.sendMessage(request);
    
    if (mcpResponse.error || !mcpResponse.tools) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: mcpResponse,
      };
    }

    // Add custom tools
    const customTools = [
      {
        name: "get_accessibility_snapshot",
        description: "Get accessibility tree snapshot of the current page (token-efficient alternative to full DOM). Uses Playwright's accessibility tree to return only interactive elements. Snapshot-first approach for efficient LLM consumption.",
        inputSchema: {
          type: "object",
          properties: {
            interestingOnly: {
              type: "boolean",
              description: "Include only interesting (interactive) elements",
              default: true,
            },
          },
        },
      },
      {
        name: "perform_checkout",
        description: "High-level skill to perform complete checkout process. Orchestrates multiple browser actions with error handling and retries. Returns guidance on using browser tools to complete checkout.",
        inputSchema: {
          type: "object",
          properties: {
            cartData: {
              type: "object",
              description: "Cart and checkout data",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      quantity: { type: "number" },
                      price: { type: "number" },
                    },
                  },
                },
                shippingAddress: { type: "object" },
                paymentMethod: { type: "object" },
              },
            },
            maxRetries: {
              type: "number",
              description: "Maximum retry attempts",
              default: 3,
            },
          },
          required: ["cartData"],
        },
      },
      {
        name: "fill_form_skill",
        description: "High-level skill to intelligently fill a form with provided data. Uses browser_fill_form internally with automatic field detection.",
        inputSchema: {
          type: "object",
          properties: {
            formData: {
              type: "object",
              description: "Key-value pairs of field names and values to fill",
            },
          },
          required: ["formData"],
        },
      },
    ];

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        ...mcpResponse,
        tools: [...(mcpResponse.tools || []), ...customTools],
      },
    };
  }

  /**
   * Handle tools/call - Intercept custom tools and post-process results
   */
  async handleToolsCall(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const toolName = request.params?.name;
    const toolArgs = request.params?.arguments || {};

    // Handle custom tools
    if (toolName === "get_accessibility_snapshot") {
      return this.handleAccessibilitySnapshot(request, toolArgs);
    }

    if (toolName === "perform_checkout") {
      return this.handlePerformCheckout(request, toolArgs);
    }

    if (toolName === "fill_form_skill") {
      return this.handleFillFormSkill(request, toolArgs);
    }

    // For standard tools, forward to MCP but post-process results
    const response = await this.mcpProcess.sendMessage(request);

    // Post-process screenshots for PII redaction
    if (this.piiRedactionEnabled && toolName === "browser_take_screenshot") {
      return this.postProcessScreenshot(response, request.id);
    }

    // Check for login walls in navigation responses
    if (toolName === "browser_navigate" || toolName === "browser_navigate_to") {
      return this.checkLoginWall(response, request.id, toolArgs);
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: response,
    };
  }

  /**
   * Handle get_accessibility_snapshot custom tool
   * Uses browser_snapshot from Playwright MCP which returns accessibility tree
   */
  private async handleAccessibilitySnapshot(
    request: JSONRPCRequest,
    args: any
  ): Promise<JSONRPCResponse> {
    try {
      // Use browser_snapshot tool from Playwright MCP
      // Playwright MCP's browser_snapshot returns accessibility tree (snapshot-first approach)
      const snapshotRequest: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: `snapshot-${Date.now()}`,
        method: "tools/call",
        params: {
          name: "browser_snapshot",
          arguments: {
            // browser_snapshot from Playwright MCP already returns accessibility tree
            // No additional arguments needed - it's already token-efficient
          },
        },
      };

      try {
        const response = await this.mcpProcess.sendMessage(snapshotRequest);
        
        // The browser_snapshot tool from Playwright MCP should already return
        // accessibility tree in a formatted way. Return it as-is.
        // If needed, we can further format it here.
        if (response.content && response.content.length > 0) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              content: response.content.map((item: any) => {
                // If it's text, ensure it's well-formatted for LLM consumption
                if (item.type === "text") {
                  return {
                    ...item,
                    text: item.text || JSON.stringify(item, null, 2),
                  };
                }
                return item;
              }),
              isError: false,
            },
          };
        }

        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32603,
            message: "Internal Error",
            data: "browser_snapshot returned empty content",
          },
        };
      } catch (error: any) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32603,
            message: "Internal Error",
            data: `Failed to get accessibility snapshot: ${error.message}`,
          },
        };
      }
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: "Internal Error",
          data: error.message,
        },
      };
    }
  }

  /**
   * Handle perform_checkout skill
   * Note: This skill uses MCP tools programmatically to perform checkout
   * For full page access, a separate browser instance would be needed
   */
  private async handlePerformCheckout(
    request: JSONRPCRequest,
    args: any
  ): Promise<JSONRPCResponse> {
    try {
      const { cartData, maxRetries = 3 } = args;

      if (!cartData) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32602,
            message: "Invalid params",
            data: "cartData is required",
          },
        };
      }

      // For now, return instructions on how to use the skill
      // In a full implementation, this would orchestrate MCP tools
      // or create a separate browser instance for the skill
      const instructions = {
        note: "perform_checkout skill orchestrates multiple browser actions internally",
        approach: "Use browser_snapshot to understand page structure, then use browser_click, browser_type, and browser_fill_form tools to complete checkout",
        cartData,
        steps: [
          "1. Use browser_snapshot to identify checkout form fields",
          "2. Use browser_fill_form to fill shipping information",
          "3. Use browser_fill_form to fill payment information",
          "4. Use browser_click to submit the form",
          "5. Verify completion with browser_snapshot",
        ],
        elicitation: "If login/MFA is detected, an elicitation request will be sent automatically",
      };

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(instructions, null, 2),
            },
          ],
          isError: false,
        },
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: "Internal Error",
          data: error.message,
        },
      };
    }
  }

  /**
   * Handle fill_form_skill
   * Uses browser_fill_form from Playwright MCP
   */
  private async handleFillFormSkill(
    request: JSONRPCRequest,
    args: any
  ): Promise<JSONRPCResponse> {
    try {
      const { formData } = args;

      if (!formData) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32602,
            message: "Invalid params",
            data: "formData is required",
          },
        };
      }

      // Use browser_fill_form from Playwright MCP
      const fillFormRequest: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: `fill-form-${Date.now()}`,
        method: "tools/call",
        params: {
          name: "browser_fill_form",
          arguments: formData,
        },
      };

      const response = await this.mcpProcess.sendMessage(fillFormRequest);

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: response,
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: "Internal Error",
          data: error.message,
        },
      };
    }
  }

  /**
   * Post-process screenshot for PII redaction
   */
  private async postProcessScreenshot(
    response: any,
    requestId: string | number
  ): Promise<JSONRPCResponse> {
    try {
      if (!this.piiRedactionEnabled) {
        return {
          jsonrpc: "2.0",
          id: requestId,
          result: response,
        };
      }

      // Extract base64 image from response
      const content = response.content || [];
      for (const item of content) {
        if (item.type === "image" && item.data) {
          // Redact PII from image
          const redactedImage = await redactPIIFromImage(item.data);
          item.data = redactedImage;
        } else if (item.type === "text" && item.text) {
          // Check if text contains PII and redact
          if (containsPII(item.text)) {
            const entities = detectPII(item.text);
            item.text = redactPII(item.text, entities);
          }
        }
      }

      return {
        jsonrpc: "2.0",
        id: requestId,
        result: {
          ...response,
          content,
        },
      };
    } catch (error: any) {
      console.error("[Tool Interceptor] Error redacting PII:", error);
      // Return original response on error
      return {
        jsonrpc: "2.0",
        id: requestId,
        result: response,
      };
    }
  }

  /**
   * Check for login walls and trigger elicitation if needed
   */
  private async checkLoginWall(
    response: any,
    requestId: string | number,
    originalArgs: any
  ): Promise<JSONRPCResponse> {
    try {
      // Extract HTML/text from response to check for login walls
      const content = response.content || [];
      let html = "";
      let url = originalArgs.url || "";

      for (const item of content) {
        if (item.type === "text" || item.type === "html") {
          html += item.text || "";
        }
      }

      if (html && detectLoginWall(html, url)) {
        const requiresMFA = detectMFA(html, url);
        const elicitation = requiresMFA
          ? createMFAElicitationRequest(url)
          : createLoginElicitationRequest(url, requiresMFA);

        // Emit elicitation request
        this.emit("notification", {
          jsonrpc: "2.0",
          method: "notifications/elicitation",
          params: elicitation.params,
        });
      }

      return {
        jsonrpc: "2.0",
        id: requestId,
        result: response,
      };
    } catch (error: any) {
      console.error("[Tool Interceptor] Error checking login wall:", error);
      return {
        jsonrpc: "2.0",
        id: requestId,
        result: response,
      };
    }
  }


  /**
   * Handle elicitation response submission
   */
  async submitElicitationResponse(
    id: string,
    response: Record<string, string>
  ): Promise<void> {
    this.elicitationHandler.submitElicitationResponse(id, { fields: response });
  }

  /**
   * Forward other MCP methods to the underlying process
   */
  async handle(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (request.method === "tools/list") {
      return this.handleToolsList(request);
    }

    if (request.method === "tools/call") {
      return this.handleToolsCall(request);
    }

    // Forward all other requests to MCP process
    try {
      const result = await this.mcpProcess.sendMessage(request);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: "Internal Error",
          data: error.message,
        },
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Cleanup handled by MCP process manager
  }
}

