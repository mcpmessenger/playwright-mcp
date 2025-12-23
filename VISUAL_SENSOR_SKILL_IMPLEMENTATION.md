# Visual Sensor Skill Implementation

This document describes the transformation of the Playwright MCP server from a "Browser Driver" to a "Visual Sensor Skill" with enhanced privacy and intelligence capabilities.

## Overview

The implementation adds four key capabilities:

1. **Snapshot-First Logic**: Token-efficient accessibility tree snapshots instead of full DOM
2. **PII Blurring**: Automatic redaction of personally identifiable information from screenshots
3. **Human-in-the-Loop (Elicitation)**: Detects MFA/login walls and requests user input
4. **High-Level Skills**: Skill-based tools instead of low-level browser commands

## Architecture

### Key Components

#### 1. Tool Interceptor (`src/tool-interceptor.ts`)
- Intercepts `tools/list` to add custom tools
- Intercepts `tools/call` to handle custom tools and post-process results
- Integrates PII redaction for screenshots
- Detects login walls and triggers elicitation requests

#### 2. Accessibility Snapshot (`src/accessibility-snapshot.ts`)
- Provides `get_accessibility_snapshot` tool
- Uses Playwright's accessibility tree API
- Formats output for efficient LLM consumption
- Extracts only interactive elements (token-efficient)

#### 3. PII Redaction (`src/pii-redaction.ts`)
- Detects PII in text (emails, credit cards, phone numbers, SSNs, etc.)
- Redacts PII with appropriate masks
- Placeholder for OCR-based image redaction (future enhancement)
- Agentic security approach - automatic protection

#### 4. Elicitation Handler (`src/elicitation-handler.ts`)
- Detects login walls and MFA requirements
- Creates elicitation requests for user input
- Manages elicitation request/response lifecycle
- Integrates with MCP notification system

#### 5. Skills Module (`src/skills.ts`)
- High-level skills like `perform_checkout`
- Handles complex workflows internally
- Error handling and retry logic
- Returns only final results (abstraction layer)

## Custom Tools

### `get_accessibility_snapshot`
- **Purpose**: Token-efficient alternative to full DOM
- **Description**: Returns accessibility tree snapshot with only interactive elements
- **Implementation**: Uses `browser_snapshot` from Playwright MCP (which already returns accessibility tree)
- **Usage**: Call this instead of requesting full DOM for better token efficiency

### `perform_checkout`
- **Purpose**: High-level checkout skill
- **Description**: Orchestrates complete checkout process
- **Current Implementation**: Provides guidance on using browser tools
- **Future**: Can be enhanced to orchestrate MCP tools programmatically

### `fill_form_skill`
- **Purpose**: Intelligent form filling
- **Description**: Fills forms with automatic field detection
- **Implementation**: Uses `browser_fill_form` from Playwright MCP

## PII Redaction

### Supported PII Types
- Email addresses
- Credit card numbers
- Phone numbers
- Social Security Numbers (SSN)
- Dates of birth
- Names (placeholder)
- Addresses (placeholder)

### Implementation Status
- ✅ Text-based PII detection and redaction
- ⚠️ Image/screenshot OCR redaction (placeholder - requires OCR library like Tesseract.js)

### Usage
PII redaction is automatically applied to:
- Screenshot responses from `browser_take_screenshot`
- Text content in tool responses

## Elicitation (Human-in-the-Loop)

### Detection
The system automatically detects:
- Login walls
- Multi-factor authentication (MFA) requirements
- Two-factor authentication (2FA)

### Flow
1. Tool interceptor checks navigation responses for login indicators
2. If detected, creates appropriate elicitation request
3. Emits notification via MCP notification system
4. Client receives elicitation request via SSE
5. Client responds with credentials
6. System continues with authentication

### Elicitation Request Format
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/elicitation",
  "params": {
    "prompt": "This site requires login. Please provide your credentials.",
    "fields": [
      {
        "name": "username",
        "description": "Username or email address",
        "type": "email",
        "required": true
      },
      {
        "name": "password",
        "description": "Password",
        "type": "password",
        "required": true
      }
    ]
  }
}
```

## Configuration

PII redaction is enabled by default. To disable:

```typescript
const toolInterceptor = new ToolInterceptor(mcpProcess, {
  piiRedactionEnabled: false,
});
```

## Integration

The tool interceptor is integrated into the MCP handler:

```typescript
// src/mcp-handler.ts
this.toolInterceptor = new ToolInterceptor(this.processManager, {
  piiRedactionEnabled: true,
});
```

All tool calls go through the interceptor, which:
1. Adds custom tools to the tools list
2. Handles custom tool implementations
3. Post-processes standard tool results (PII redaction)
4. Detects and handles elicitation scenarios

## Future Enhancements

1. **Full OCR Integration**: Integrate Tesseract.js or similar for screenshot PII redaction
2. **ML-based PII Detection**: Enhance with Presidio or similar for better accuracy
3. **Skill Orchestration**: Full implementation of `perform_checkout` that orchestrates MCP tools
4. **Session Management**: Better integration with MCP browser session management
5. **Skill Library**: Expand skill library with more high-level operations

## Usage Examples

### Get Accessibility Snapshot
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_accessibility_snapshot",
    "arguments": {
      "interestingOnly": true
    }
  }
}
```

### Perform Checkout (Guidance)
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "perform_checkout",
    "arguments": {
      "cartData": {
        "items": [...],
        "shippingAddress": {...},
        "paymentMethod": {...}
      }
    }
  }
}
```

## Benefits

1. **Token Efficiency**: Accessibility snapshots reduce token usage vs full DOM
2. **Privacy**: Automatic PII redaction protects sensitive information
3. **User Experience**: Elicitation prevents failures on login/MFA sites
4. **Abstraction**: High-level skills simplify complex workflows
5. **Security**: Agentic security approach - automatic protection by default

