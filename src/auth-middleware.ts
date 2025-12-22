/**
 * Authentication middleware for bearer token validation
 */

import { Request, Response, NextFunction } from "express";
import { Config } from "./config";

/**
 * Load auth token from Secret Manager if AUTH_SECRET_NAME is set
 */
async function getAuthToken(config: Config): Promise<string | undefined> {
  if (config.authToken) {
    return config.authToken;
  }

  if (config.authSecretName) {
    try {
      // Dynamically import Secret Manager to avoid requiring it as a dependency
      // TypeScript will complain if package isn't installed, but runtime will handle it
      const secretManagerModule = "@google-cloud/secret-manager";
      const secretManager = await import(secretManagerModule as any).catch(() => null);
      if (!secretManager) {
        throw new Error("@google-cloud/secret-manager package is not installed. Run: npm install @google-cloud/secret-manager");
      }
      
      const { SecretManagerServiceClient } = secretManager;
      const client = new SecretManagerServiceClient();
      const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
      
      if (projectId) {
        const name = `projects/${projectId}/secrets/${config.authSecretName}/versions/latest`;
        const [version] = await client.accessSecretVersion({ name });
        return version.payload?.data?.toString();
      }
    } catch (error: any) {
      console.error("[Auth] Failed to load secret from Secret Manager:", error);
      throw new Error(`Failed to load authentication token from Secret Manager: ${error.message}`);
    }
  }

  return undefined;
}

// Cache the token to avoid repeated Secret Manager calls
let cachedToken: string | undefined | null = null;
let tokenPromise: Promise<string | undefined> | null = null;

async function getCachedAuthToken(config: Config): Promise<string | undefined> {
  if (cachedToken !== null) {
    return cachedToken;
  }

  if (!tokenPromise) {
    tokenPromise = getAuthToken(config);
    tokenPromise.then(token => {
      cachedToken = token;
      tokenPromise = null;
    }).catch(() => {
      tokenPromise = null;
    });
  }

  return tokenPromise;
}

/**
 * Middleware to validate bearer token authentication
 */
export function createAuthMiddleware(config: Config) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip auth if not enabled
    if (!config.enableAuth) {
      return next();
    }

    // Get authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32001,
          message: "Unauthorized",
          data: "Missing Authorization header",
        },
      });
    }

    // Check for Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32001,
          message: "Unauthorized",
          data: "Invalid Authorization header format. Expected: Bearer <token>",
        },
      });
    }

    const providedToken = parts[1];

    // Get expected token
    try {
      const expectedToken = await getCachedAuthToken(config);
      
      if (!expectedToken) {
        console.error("[Auth] No auth token configured");
        return res.status(500).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: "Internal Error",
            data: "Authentication not properly configured",
          },
        });
      }

      // Compare tokens (use constant-time comparison to prevent timing attacks)
      if (!constantTimeCompare(providedToken, expectedToken)) {
        return res.status(401).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32001,
            message: "Unauthorized",
            data: "Invalid token",
          },
        });
      }

      // Token is valid
      next();
    } catch (error: any) {
      console.error("[Auth] Authentication error:", error);
      return res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: "Internal Error",
          data: error.message,
        },
      });
    }
  };
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

