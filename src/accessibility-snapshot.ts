/**
 * Accessibility Snapshot Tool
 * Snapshot-First Logic: Provides LLM with only interactive elements via accessibility tree
 */

import { Page } from "playwright";
import { EventEmitter } from "events";

export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  keyboardShortcut?: string;
  roledescription?: string;
  valuetext?: string;
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  modal?: boolean;
  multiline?: boolean;
  multiselectable?: boolean;
  readonly?: boolean;
  required?: boolean;
  selected?: boolean;
  checked?: boolean | "mixed";
  pressed?: boolean | "mixed";
  level?: number;
  valuemin?: number;
  valuemax?: number;
  autocomplete?: string;
  haspopup?: string;
  invalid?: string;
  orientation?: string;
  children?: AccessibilityNode[];
}

export interface AccessibilitySnapshotResult {
  role: string;
  name?: string;
  children?: AccessibilityNode[];
}

/**
 * Get accessibility snapshot from a page
 * Note: This function is kept for potential future direct Playwright usage
 * Currently, we use browser_snapshot from Playwright MCP which already returns accessibility tree
 */
export async function getAccessibilitySnapshot(
  page: Page,
  interestingOnly: boolean = true
): Promise<AccessibilitySnapshotResult | null> {
  // Note: page.accessibility.snapshot() is deprecated in newer Playwright versions
  // We use browser_snapshot from Playwright MCP instead
  // This function is kept for potential future use or if we need direct page access
  throw new Error(
    "Direct accessibility snapshot not implemented. Use browser_snapshot from Playwright MCP instead."
  );
}

/**
 * Format accessibility snapshot as text for LLM consumption
 */
export function formatAccessibilitySnapshot(
  snapshot: AccessibilitySnapshotResult | null
): string {
  if (!snapshot) {
    return "No accessible elements found on the page.";
  }

  const formatNode = (node: AccessibilityNode, indent: number = 0): string => {
    const indentStr = "  ".repeat(indent);
    const parts: string[] = [];

    // Build node description
    const nodeDesc = [
      node.role,
      node.name && `"${node.name}"`,
      node.value && `value="${node.value}"`,
      node.description && `description="${node.description}"`,
      node.disabled && "[disabled]",
      node.checked !== undefined && `checked=${node.checked}`,
      node.selected && "[selected]",
      node.required && "[required]",
    ]
      .filter(Boolean)
      .join(" ");

    parts.push(`${indentStr}- ${nodeDesc}`);

    // Add children
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        parts.push(formatNode(child, indent + 1));
      }
    }

    return parts.join("\n");
  };

  return formatNode(snapshot as AccessibilityNode);
}

/**
 * Extract interactive elements from accessibility snapshot
 * Filters to only actionable/interactive elements
 */
export function extractInteractiveElements(
  snapshot: AccessibilitySnapshotResult | null
): Array<{ role: string; name?: string; selector?: string }> {
  if (!snapshot) {
    return [];
  }

  const interactiveRoles = [
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "menuitem",
    "tab",
    "switch",
    "slider",
    "option",
  ];

  const elements: Array<{ role: string; name?: string; selector?: string }> =
    [];

  const traverse = (node: AccessibilityNode) => {
    if (interactiveRoles.includes(node.role)) {
      elements.push({
        role: node.role,
        name: node.name,
      });
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  };

  traverse(snapshot as AccessibilityNode);

  return elements;
}

