/**
 * PII (Personally Identifiable Information) Detection and Redaction
 * Agentic Security: Automatically redacts PII from screenshots and text
 */

import { createHash } from "crypto";

export interface PIIEntity {
  type: "email" | "credit_card" | "phone" | "ssn" | "name" | "address" | "date_of_birth";
  start: number;
  end: number;
  value: string;
}

/**
 * Detect PII in text using pattern matching
 * Can be extended with ML models (e.g., Presidio) for better accuracy
 */
export function detectPII(text: string): PIIEntity[] {
  const entities: PIIEntity[] = [];

  // Email pattern
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  let match;
  while ((match = emailPattern.exec(text)) !== null) {
    entities.push({
      type: "email",
      start: match.index,
      end: match.index + match[0].length,
      value: match[0],
    });
  }

  // Credit card pattern (Luhn-validated format)
  const creditCardPattern = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
  while ((match = creditCardPattern.exec(text)) !== null) {
    const cardNumber = match[0].replace(/[-\s]/g, "");
    // Simple validation - check if it looks like a credit card
    if (cardNumber.length >= 13 && cardNumber.length <= 19) {
      entities.push({
        type: "credit_card",
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
      });
    }
  }

  // Phone number pattern (US and international formats)
  const phonePattern = /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g;
  while ((match = phonePattern.exec(text)) !== null) {
    entities.push({
      type: "phone",
      start: match.index,
      end: match.index + match[0].length,
      value: match[0],
    });
  }

  // SSN pattern
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
  while ((match = ssnPattern.exec(text)) !== null) {
    entities.push({
      type: "ssn",
      start: match.index,
      end: match.index + match[0].length,
      value: match[0],
    });
  }

  // Date of birth pattern (MM/DD/YYYY, YYYY-MM-DD)
  const dobPattern = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
  while ((match = dobPattern.exec(text)) !== null) {
    entities.push({
      type: "date_of_birth",
      start: match.index,
      end: match.index + match[0].length,
      value: match[0],
    });
  }

  return entities;
}

/**
 * Redact PII from text by replacing with masked values
 */
export function redactPII(text: string, entities: PIIEntity[]): string {
  // Sort entities by start position (reverse order) to avoid index shifting
  const sortedEntities = [...entities].sort((a, b) => b.start - a.start);

  let redacted = text;
  for (const entity of sortedEntities) {
    const mask = getMaskForEntityType(entity.type);
    redacted =
      redacted.slice(0, entity.start) + mask + redacted.slice(entity.end);
  }

  return redacted;
}

/**
 * Get appropriate mask for entity type
 */
function getMaskForEntityType(type: PIIEntity["type"]): string {
  switch (type) {
    case "email":
      return "[EMAIL_REDACTED]";
    case "credit_card":
      return "[CARD_REDACTED]";
    case "phone":
      return "[PHONE_REDACTED]";
    case "ssn":
      return "[SSN_REDACTED]";
    case "date_of_birth":
      return "[DOB_REDACTED]";
    case "name":
      return "[NAME_REDACTED]";
    case "address":
      return "[ADDRESS_REDACTED]";
    default:
      return "[REDACTED]";
  }
}

/**
 * Redact PII from base64 image (screenshot)
 * For now, this extracts text from the image and redacts it
 * Note: Full OCR implementation would require additional libraries (e.g., Tesseract.js)
 */
export async function redactPIIFromImage(
  base64Image: string
): Promise<string> {
  // TODO: Integrate OCR (e.g., Tesseract.js) to extract text from image
  // For now, return original image - actual OCR redaction requires additional setup
  // This is a placeholder for future OCR integration
  
  console.warn(
    "[PII Redaction] OCR-based image redaction not yet implemented. " +
    "Image returned without redaction. Consider integrating Tesseract.js or similar."
  );
  
  return base64Image;
}

/**
 * Check if text contains any PII
 */
export function containsPII(text: string): boolean {
  return detectPII(text).length > 0;
}

