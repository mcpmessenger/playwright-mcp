# Critical Issues Report: Browser Operations Blocked

**Date**: December 22, 2024  
**Priority**: High  
**Status**: Two Critical Issues Blocking Browser Operations  
**Affected Package**: `@playwright/mcp` (external dependency)

---

## Summary

We've tested the updated Playwright HTTP server and found **two critical issues** in the `@playwright/mcp` package that are preventing browser operations from working:

1. **URL Parameter Extraction** - Browser navigation fails with "Invalid URL: undefined"
2. **Browser Arguments Not Applied** - Chrome can't run in Cloud Run environment

---

## Issue 1: URL Parameter Extraction ❌

### Problem
Browser navigation fails with: `SyntaxError: browserType.launch: Invalid URL: undefined`

### What We're Sending (Correct ✅)
Our HTTP server forwards JSON-RPC requests correctly:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "browser_navigate",
    "arguments": {
      "url": "https://google.com"
    }
  }
}
```

### What's Happening
- ✅ Our server receives the request correctly
- ✅ Our server forwards JSON-RPC format correctly
- ✅ URL is in `params.arguments.url`
- ❌ `@playwright/mcp` package extracts `undefined` instead of the URL
- ❌ Browser launch fails in the `@playwright/mcp` package

### Root Cause
The `@playwright/mcp` package is not correctly extracting `params.arguments.url` from the JSON-RPC request structure.

### Required Fix (in @playwright/mcp package)
```typescript
// In @playwright/mcp tools/call handler
async handleToolCall(params: { name: string; arguments?: any }) {
  if (params.name === 'browser_navigate') {
    // FIX: Extract URL correctly
    const url = params.arguments?.url
    if (!url || typeof url !== 'string') {
      throw new Error('browser_navigate requires a valid URL string')
    }
    
    // FIX: Use URL for page.goto(), NOT browser.launch()
    const browser = await playwright.chromium.launch({
      headless: true,
      args: browserArgs
    })
    const page = await browser.newPage()
    await page.goto(url)  // URL goes here, not in launch()
  }
}
```

---

## Issue 2: Browser Arguments Not Applied ❌

### Problem
Chrome fails to launch: `Running as root without --no-sandbox is not supported. See https://crbug.com/638180.`

### What We've Done (Our HTTP Server ✅)
We pass the environment variable to the spawned `@playwright/mcp` process:
```typescript
// In src/playwright-process.ts
const env: NodeJS.ProcessEnv = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || undefined,
};

// Pass PLAYWRIGHT_BROWSER_ARGS to the spawned process
if (process.env.PLAYWRIGHT_BROWSER_ARGS) {
  env.PLAYWRIGHT_BROWSER_ARGS = process.env.PLAYWRIGHT_BROWSER_ARGS;
  console.log(`[Playwright process] Browser args: ${process.env.PLAYWRIGHT_BROWSER_ARGS}`);
}
```

### Configuration
Environment variable is set in Cloud Run:
```
PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu
```

### What's Happening
- ✅ Environment variable is configured in Cloud Run
- ✅ Our HTTP server passes it to the spawned `@playwright/mcp` process
- ❌ `@playwright/mcp` package is not reading `PLAYWRIGHT_BROWSER_ARGS`
- ❌ Chrome launches without `--no-sandbox` flag
- ❌ Chrome crashes immediately

### Root Cause
The `@playwright/mcp` package is not reading the `PLAYWRIGHT_BROWSER_ARGS` environment variable when launching browsers.

### Required Fix (in @playwright/mcp package)
```typescript
// In @playwright/mcp browser launch code
const browserArgs = []

// FIX: Read PLAYWRIGHT_BROWSER_ARGS from environment
if (process.env.PLAYWRIGHT_BROWSER_ARGS) {
  const envArgs = process.env.PLAYWRIGHT_BROWSER_ARGS
    .split(' ')
    .filter(arg => arg.trim().length > 0)
  browserArgs.push(...envArgs)
}

// Add default args if needed
browserArgs.push('--disable-dev-shm-usage')

const browser = await playwright.chromium.launch({
  headless: true,
  args: browserArgs  // Apply the args here
})
```

---

## Test Evidence

### Direct Server Test
```bash
curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "browser_navigate",
      "arguments": {
        "url": "https://google.com"
      }
    }
  }'
```

**Response**: Both errors occur:
1. `SyntaxError: browserType.launch: Invalid URL: undefined`
2. Chrome fails without `--no-sandbox`

### Server Logs Show
```
[Playwright process] Browser args: --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu
[Playwright stdout] {"method":"tools/call","params":{"name":"browser_navigate","arguments":{"url":"https://google.com"}}}
[Playwright stderr] Running as root without --no-sandbox is not supported
[Playwright stderr] SyntaxError: browserType.launch: Invalid URL: undefined
```

This confirms:
- ✅ Our server correctly passes browser args env var
- ✅ Our server correctly forwards the JSON-RPC request
- ❌ `@playwright/mcp` doesn't read the env var
- ❌ `@playwright/mcp` doesn't extract the URL correctly

---

## Impact

**Current Status**: ❌ **Browser operations completely blocked**

- Browser navigation: ❌ Fails
- Screenshots: ❌ Fails  
- All browser tools: ❌ Failing

**User Impact**: Playwright MCP server is unusable in production until `@playwright/mcp` package is updated.

---

## Our Implementation Status

### ✅ What We've Fixed (HTTP Server)
1. Browser lock issue - Added `--isolated` flag
2. Security improvements - Rate limiting, validation, timeouts
3. Environment variable passthrough - `PLAYWRIGHT_BROWSER_ARGS` is passed to spawned process
4. Trust proxy configuration - For Cloud Run rate limiting
5. Request forwarding - JSON-RPC format is correct

### ❌ What Needs Fixing (External Package)
1. URL extraction - `@playwright/mcp` must fix parameter parsing
2. Browser args - `@playwright/mcp` must read `PLAYWRIGHT_BROWSER_ARGS` env var

---

## Required Actions

### Option 1: Fix in @playwright/mcp (Recommended)
The `@playwright/mcp` package maintainers need to:
1. Fix URL extraction from `params.arguments.url`
2. Read and apply `PLAYWRIGHT_BROWSER_ARGS` environment variable
3. Use URL for `page.goto()`, not `browser.launch()`

### Option 2: Fork @playwright/mcp (Workaround)
If we need immediate fixes, we could:
1. Fork the `@playwright/mcp` package
2. Apply the fixes ourselves
3. Use our fork until upstream is fixed

### Option 3: Contact Package Maintainers
1. File issues on `@playwright/mcp` GitHub repository
2. Submit PRs with the fixes
3. Work with maintainers to get fixes merged

---

## Quick Fix Checklist (for @playwright/mcp team)

- [ ] Fix URL extraction: `params.arguments?.url`
- [ ] Read `PLAYWRIGHT_BROWSER_ARGS` env var
- [ ] Apply browser args to `browser.launch()`
- [ ] Use URL for `page.goto()`, not `browser.launch()`
- [ ] Test with: `browser_navigate` to `https://google.com`
- [ ] Verify Chrome launches with `--no-sandbox`

---

## Test After Fix

Once `@playwright/mcp` is updated, test with:

```bash
curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "browser_navigate",
      "arguments": {
        "url": "https://google.com"
      }
    }
  }'
```

**Expected**: Success response with navigation result  
**Current**: Error with "Invalid URL: undefined" and Chrome sandbox error

---

## References

- Browser args documentation: `PLAYWRIGHT_BROWSER_ARGS_ISSUE.md`
- Our implementation: `src/playwright-process.ts` (lines 47-64)
- Environment variable: Set in Cloud Run deployment

---

## Next Steps

1. **Immediate**: Document these issues for tracking
2. **Short-term**: Contact `@playwright/mcp` maintainers or file GitHub issues
3. **Medium-term**: Consider forking if fixes aren't available soon
4. **Long-term**: Monitor `@playwright/mcp` updates and upgrade when fixes are available

---

**Status**: These issues are in the external `@playwright/mcp` package. Our HTTP server correctly forwards requests and passes environment variables, but the package itself needs updates to handle URL extraction and browser arguments.
