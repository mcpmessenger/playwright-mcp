/**
 * Request validation utilities for security
 */

/**
 * Validate if a URL is safe to navigate to
 * @param url The URL to validate
 * @param allowedDomains Optional whitelist of allowed domains
 * @returns true if URL is valid and allowed
 */
export function isValidUrl(url: string, allowedDomains?: string[]): boolean {
  try {
    const parsed = new URL(url);

    // Reject non-HTTP(S) protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    // If no whitelist is provided, allow all HTTP(S) URLs
    if (!allowedDomains || allowedDomains.length === 0) {
      return true;
    }

    // Check if hostname matches any allowed domain
    const hostname = parsed.hostname.toLowerCase();
    return allowedDomains.some((domain) => {
      const domainLower = domain.toLowerCase().replace(/^\./, "");
      // Allow exact match or subdomain match
      return (
        hostname === domainLower ||
        hostname.endsWith(`.${domainLower}`) ||
        hostname === `www.${domainLower}`
      );
    });
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Validate tool arguments based on tool name
 * @param tool The tool name
 * @param args The tool arguments
 * @param allowedDomains Optional whitelist of allowed domains for navigation
 * @returns Object with isValid flag and optional error message
 */
export function validateToolArgs(
  tool: string,
  args: any,
  allowedDomains?: string[]
): { isValid: boolean; error?: string } {
  if (tool === "browser_navigate" || tool === "browser_navigate_to") {
    if (!args || typeof args !== "object") {
      return {
        isValid: false,
        error: "browser_navigate requires an arguments object",
      };
    }

    const url = args.url;
    if (!url || typeof url !== "string") {
      return {
        isValid: false,
        error: "browser_navigate requires a 'url' string argument",
      };
    }

    if (!isValidUrl(url, allowedDomains)) {
      const domainList =
        allowedDomains && allowedDomains.length > 0
          ? ` Allowed domains: ${allowedDomains.join(", ")}`
          : "";
      return {
        isValid: false,
        error: `Invalid or disallowed URL: ${url}.${domainList}`,
      };
    }
  }

  // Add validation for other tools as needed
  // For now, allow other tools to pass through

  return { isValid: true };
}
