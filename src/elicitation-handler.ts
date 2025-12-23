/**
 * Human-in-the-Loop (Elicitation) Handler
 * Detects MFA/login walls and requests user input via elicitationRequest
 */

import { EventEmitter } from "events";

export interface ElicitationRequest {
  method: "prompts/request" | "notifications/elicitation";
  params: {
    prompt: string;
    description?: string;
    fields?: Array<{
      name: string;
      description: string;
      type?: "text" | "password" | "number" | "email" | "code" | "tel";
      required?: boolean;
    }>;
    context?: any;
  };
}

export interface ElicitationResponse {
  fields: Record<string, string>;
}

/**
 * Detect if page contains login/MFA walls
 */
export function detectLoginWall(html: string, url: string): boolean {
  const loginIndicators = [
    /login/i,
    /sign[\s-]?in/i,
    /authentication/i,
    /verify/i,
    /password/i,
    /username/i,
    /email[\s-]?address/i,
    /mfa/i,
    /multi[\s-]?factor/i,
    /two[\s-]?factor/i,
    /2fa/i,
    /verification[\s-]?code/i,
    /authenticator/i,
    /security[\s-]?code/i,
  ];

  const lowerHtml = html.toLowerCase();
  const lowerUrl = url.toLowerCase();

  // Check if URL or page content suggests login
  return (
    loginIndicators.some((pattern) => pattern.test(lowerUrl)) ||
    loginIndicators.some((pattern) => pattern.test(lowerHtml))
  );
}

/**
 * Detect if page requires MFA/two-factor authentication
 */
export function detectMFA(html: string, url: string): boolean {
  const mfaIndicators = [
    /mfa/i,
    /multi[\s-]?factor/i,
    /two[\s-]?factor/i,
    /2fa/i,
    /verification[\s-]?code/i,
    /authenticator/i,
    /security[\s-]?code/i,
    /enter[\s-]?code/i,
    /6[\s-]?digit/i,
    /verification[\s-]?number/i,
  ];

  const lowerHtml = html.toLowerCase();
  const lowerUrl = url.toLowerCase();

  return (
    mfaIndicators.some((pattern) => pattern.test(lowerUrl)) ||
    mfaIndicators.some((pattern) => pattern.test(lowerHtml))
  );
}

/**
 * Create elicitation request for login
 */
export function createLoginElicitationRequest(
  url: string,
  requiresMFA: boolean = false
): ElicitationRequest {
  const fields: Array<{
    name: string;
    description: string;
    type: "text" | "password" | "number" | "email" | "code" | "tel";
    required?: boolean;
  }> = [
    {
      name: "username",
      description: "Username or email address",
      type: "email",
      required: true,
    },
    {
      name: "password",
      description: "Password",
      type: "password",
      required: true,
    },
  ];

  if (requiresMFA) {
    fields.push({
      name: "mfa_code",
      description: "Multi-factor authentication code",
      type: "text",
      required: true,
    });
  }

  return {
    method: "prompts/request",
    params: {
      prompt: requiresMFA
        ? `This site requires multi-factor authentication. Please provide your credentials and MFA code.`
        : `This site requires login. Please provide your credentials.`,
      description: `Login required for ${url}`,
      fields,
      context: {
        url,
        type: requiresMFA ? "mfa_login" : "login",
      },
    },
  };
}

/**
 * Create elicitation request for MFA code only
 */
export function createMFAElicitationRequest(url: string): ElicitationRequest {
  return {
    method: "prompts/request",
    params: {
      prompt: "Please enter your multi-factor authentication code.",
      description: `MFA verification required for ${url}`,
      fields: [
        {
          name: "mfa_code",
          description: "Enter the code from your authenticator app or SMS",
          type: "text",
          required: true,
        },
      ],
      context: {
        url,
        type: "mfa",
      },
    },
  };
}

/**
 * Elicitation Handler - Manages elicitation requests and responses
 */
export class ElicitationHandler extends EventEmitter {
  private pendingElicitations: Map<
    string,
    {
      request: ElicitationRequest;
      resolve: (response: ElicitationResponse) => void;
      reject: (error: Error) => void;
      timeout?: NodeJS.Timeout;
    }
  > = new Map();
  private elicitationIdCounter: number = 0;

  /**
   * Request user input via elicitation
   */
  async requestElicitation(
    request: ElicitationRequest,
    timeoutMs: number = 300000
  ): Promise<ElicitationResponse> {
    const id = `elicitation-${++this.elicitationIdCounter}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingElicitations.delete(id);
        reject(new Error("Elicitation request timeout"));
      }, timeoutMs);

      this.pendingElicitations.set(id, {
        request,
        resolve,
        reject,
        timeout,
      });

      // Emit notification for client
      this.emit("elicitationRequest", {
        id,
        ...request,
      });
    });
  }

  /**
   * Submit elicitation response
   */
  submitElicitationResponse(
    id: string,
    response: ElicitationResponse
  ): void {
    const pending = this.pendingElicitations.get(id);
    if (!pending) {
      throw new Error(`No pending elicitation found for id: ${id}`);
    }

    this.pendingElicitations.delete(id);
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.resolve(response);
  }

  /**
   * Cancel pending elicitation
   */
  cancelElicitation(id: string, reason?: string): void {
    const pending = this.pendingElicitations.get(id);
    if (!pending) {
      return;
    }

    this.pendingElicitations.delete(id);
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.reject(
      new Error(reason || "Elicitation request cancelled")
    );
  }

  /**
   * Check if there are pending elicitations
   */
  hasPendingElicitations(): boolean {
    return this.pendingElicitations.size > 0;
  }
}

