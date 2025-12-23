/**
 * High-Level Skills Module
 * Architectural Shift: Provides skill-based tools instead of low-level browser commands
 */

import { Page } from "playwright";
import { getAccessibilitySnapshot, extractInteractiveElements } from "./accessibility-snapshot";
import { detectLoginWall, detectMFA, createLoginElicitationRequest } from "./elicitation-handler";
import { EventEmitter } from "events";

export interface CartData {
  items: Array<{
    name: string;
    quantity: number;
    price?: number;
  }>;
  shippingAddress?: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  paymentMethod?: {
    type: "card" | "paypal" | "other";
    cardNumber?: string;
    expiryDate?: string;
    cvv?: string;
    cardholderName?: string;
  };
}

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  confirmationUrl?: string;
  error?: string;
  screenshots?: string[]; // base64 screenshots of key steps
}

/**
 * Perform checkout skill - handles entire checkout process
 * This is a high-level skill that handles navigation, error handling, and retry logic internally
 */
export async function performCheckout(
  page: Page,
  cartData: CartData,
  options: {
    maxRetries?: number;
    timeout?: number;
    onElicitation?: (request: any) => Promise<any>;
  } = {}
): Promise<CheckoutResult> {
  const maxRetries = options.maxRetries || 3;
  const timeout = options.timeout || 60000;
  const screenshots: string[] = [];

  try {
    // Step 1: Navigate to cart/checkout if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes("cart") && !currentUrl.includes("checkout")) {
      // Try to find and click cart/checkout button
      const snapshot = await getAccessibilitySnapshot(page, true);
      const interactiveElements = extractInteractiveElements(snapshot);

      const cartButton = interactiveElements.find(
        (el) =>
          el.name?.toLowerCase().includes("cart") ||
          el.name?.toLowerCase().includes("checkout") ||
          el.name?.toLowerCase().includes("buy")
      );

      if (cartButton && cartButton.name) {
        await page.getByRole("button", { name: cartButton.name }).click();
        await page.waitForLoadState("networkidle", { timeout });
      }
    }

    // Check for login wall
    const html = await page.content();
    if (detectLoginWall(html, page.url())) {
      const requiresMFA = detectMFA(html, page.url());
      
      if (options.onElicitation) {
        const elicitation = createLoginElicitationRequest(
          page.url(),
          requiresMFA
        );
        const credentials = await options.onElicitation(elicitation);

        // Fill login form
        try {
          await page.fill('input[type="email"], input[name*="email"], input[name*="username"]', credentials.fields.username);
          await page.fill('input[type="password"]', credentials.fields.password);
          
          if (requiresMFA && credentials.fields.mfa_code) {
            await page.fill('input[name*="code"], input[name*="mfa"], input[name*="verification"]', credentials.fields.mfa_code);
          }

          await page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")');
          await page.waitForLoadState("networkidle", { timeout });
        } catch (error) {
          const screenshot = await page.screenshot();
          return {
            success: false,
            error: `Failed to complete login: ${error}`,
            screenshots: [screenshot.toString("base64")],
          };
        }
      } else {
        const screenshot = await page.screenshot();
        return {
          success: false,
          error: "Login required but no elicitation handler provided",
          screenshots: [screenshot.toString("base64")],
        };
      }
    }

    // Step 2: Fill shipping information if provided
    if (cartData.shippingAddress) {
      const addr = cartData.shippingAddress;
      await fillFormField(page, "name", addr.name);
      await fillFormField(page, "address", addr.address);
      await fillFormField(page, "city", addr.city);
      await fillFormField(page, "state", addr.state);
      await fillFormField(page, "zip", addr.zip);
      await fillFormField(page, "country", addr.country);

      const screenshot = await page.screenshot();
      screenshots.push(screenshot.toString("base64"));
    }

    // Step 3: Fill payment information if provided
    if (cartData.paymentMethod) {
      const payment = cartData.paymentMethod;
      if (payment.type === "card" && payment.cardNumber && payment.expiryDate && payment.cvv && payment.cardholderName) {
        await fillFormField(page, "card", payment.cardNumber);
        await fillFormField(page, "expiry", payment.expiryDate);
        await fillFormField(page, "cvv", payment.cvv);
        await fillFormField(page, "cardholder", payment.cardholderName);
      }

      const screenshot = await page.screenshot();
      screenshots.push(screenshot.toString("base64"));
    }

    // Step 4: Submit checkout
    let retries = 0;
    while (retries < maxRetries) {
      try {
        // Find and click submit/place order button
        const snapshot = await getAccessibilitySnapshot(page, true);
        const interactiveElements = extractInteractiveElements(snapshot);

        const submitButton = interactiveElements.find(
          (el) =>
            el.name?.toLowerCase().includes("place order") ||
            el.name?.toLowerCase().includes("complete order") ||
            el.name?.toLowerCase().includes("submit") ||
            el.name?.toLowerCase().includes("checkout")
        );

        if (submitButton && submitButton.name) {
          await page.getByRole("button", { name: submitButton.name }).click();
        } else {
          // Try generic submit button
          await page.click('button[type="submit"]');
        }

        // Wait for confirmation
        await page.waitForLoadState("networkidle", { timeout });
        await page.waitForTimeout(2000); // Give time for confirmation page

        const finalUrl = page.url();
        const finalHtml = await page.content();

        // Check for confirmation indicators
        if (
          finalUrl.includes("confirmation") ||
          finalUrl.includes("success") ||
          finalUrl.includes("thank") ||
          finalHtml.match(/order[\s-]?number/i) ||
          finalHtml.match(/confirmation/i) ||
          finalHtml.match(/thank[\s-]?you/i)
        ) {
          // Extract order ID if possible
          const orderIdMatch = finalHtml.match(
            /order[\s-]?(?:number|id|#)[\s:]?([A-Z0-9\-]+)/i
          );
          const orderId = orderIdMatch ? orderIdMatch[1] : undefined;

          const screenshot = await page.screenshot();
          screenshots.push(screenshot.toString("base64"));

          return {
            success: true,
            orderId,
            confirmationUrl: finalUrl,
            screenshots,
          };
        }
      } catch (error: any) {
        retries++;
        if (retries >= maxRetries) {
          return {
            success: false,
            error: `Checkout failed after ${maxRetries} retries: ${error.message}`,
            screenshots,
          };
        }
        await page.waitForTimeout(1000 * retries); // Exponential backoff
      }
    }

    return {
      success: false,
      error: "Checkout submission failed",
      screenshots,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      screenshots,
    };
  }
}

/**
 * Helper to fill form field with various selector strategies
 */
async function fillFormField(
  page: Page,
  fieldName: string,
  value: string
): Promise<void> {
  const selectors = [
    `input[name*="${fieldName}"]`,
    `input[id*="${fieldName}"]`,
    `input[placeholder*="${fieldName}"]`,
    `textarea[name*="${fieldName}"]`,
    `textarea[id*="${fieldName}"]`,
  ];

  for (const selector of selectors) {
    try {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        await element.fill(value);
        return;
      }
    } catch {
      // Try next selector
    }
  }

  // If no input found, try by accessible name
  try {
    await page.getByLabel(fieldName, { exact: false }).fill(value);
  } catch {
    // Field not found, continue
    console.warn(`Could not find field: ${fieldName}`);
  }
}

/**
 * Fill form skill - intelligently fills a form with provided data
 */
export async function fillForm(
  page: Page,
  formData: Record<string, string>,
  options: { timeout?: number } = {}
): Promise<{ success: boolean; filledFields: string[]; errors: string[] }> {
  const timeout = options.timeout || 30000;
  const filledFields: string[] = [];
  const errors: string[] = [];

  for (const [fieldName, value] of Object.entries(formData)) {
    try {
      await fillFormField(page, fieldName, value);
      filledFields.push(fieldName);
      await page.waitForTimeout(100); // Small delay between fields
    } catch (error: any) {
      errors.push(`${fieldName}: ${error.message}`);
    }
  }

  return {
    success: errors.length === 0,
    filledFields,
    errors,
  };
}

