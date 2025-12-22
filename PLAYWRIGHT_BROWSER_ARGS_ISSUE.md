# Playwright Browser Arguments & URL Parameter Issues

## Status

### ✅ Fixed: Browser Arguments Support
- **Fixed in**: `src/playwright-process.ts`
- **Change**: Now passes `PLAYWRIGHT_BROWSER_ARGS` environment variable to the spawned Playwright MCP process
- **Usage**: Set `PLAYWRIGHT_BROWSER_ARGS` environment variable (e.g., `--no-sandbox --disable-setuid-sandbox`) for Cloud Run deployments

### ⚠️ Known Issue: URL Parameter Extraction (in @playwright/mcp)
- **Location**: The `@playwright/mcp` package (external dependency)
- **Issue**: The `@playwright/mcp` package may not correctly extract `params.arguments.url` from JSON-RPC requests
- **Impact**: Browser navigation fails with "Invalid URL: undefined" error
- **Workaround**: None - requires fix in `@playwright/mcp` package
- **Note**: Our HTTP server correctly forwards the JSON-RPC request structure

## Browser Arguments Configuration

### For Cloud Run Deployments

Set the `PLAYWRIGHT_BROWSER_ARGS` environment variable when deploying:

```bash
gcloud run services update playwright-mcp-http-server \
  --update-env-vars "PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage" \
  --region=us-central1
```

### Recommended Browser Arguments for Cloud Run

- `--no-sandbox` - Required for running Chrome as root (Cloud Run default)
- `--disable-setuid-sandbox` - Additional sandbox disable flag
- `--disable-dev-shm-usage` - Overcome limited `/dev/shm` in containers
- `--disable-gpu` - Disable GPU (not available in Cloud Run)
- `--single-process` - Optional: Run in single process (may help with resource limits)

**Example**:
```bash
PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu
```

## URL Parameter Issue

### Error
```
SyntaxError: browserType.launch: Invalid URL: undefined
```

### Root Cause
The `@playwright/mcp` package (which we spawn and communicate with via JSON-RPC) appears to have an issue with:
1. Extracting `params.arguments.url` from the JSON-RPC request
2. Using the URL correctly (should use `page.goto(url)`, not pass to `browser.launch()`)

### Our Request Format (Correct ✅)
Our HTTP server sends JSON-RPC requests in the correct format:
```json
{
  "jsonrpc": "2.0",
  "id": 1234567890,
  "method": "tools/call",
  "params": {
    "name": "browser_navigate",
    "arguments": {
      "url": "https://google.com"
    }
  }
}
```

### Expected Behavior
The `@playwright/mcp` package should:
1. Parse `params.arguments.url`
2. Launch browser with configured args (from `PLAYWRIGHT_BROWSER_ARGS`)
3. Create a page and call `page.goto(url)`

### Actual Behavior
The package appears to:
1. Receive the request ✅
2. Fail to extract `url` from `params.arguments` ❌
3. Try to launch browser with `undefined` URL ❌

### Required Fix (in @playwright/mcp)
The fix needs to be made in the `@playwright/mcp` package code:

```typescript
// Should extract URL like this:
const url = params.arguments?.url

// Should use URL for navigation, not launch:
const browser = await playwright.chromium.launch({
  headless: true,
  args: browserArgs // from PLAYWRIGHT_BROWSER_ARGS
})
const page = await browser.newPage()
await page.goto(url) // Not browser.launch({ url })
```

## Related Documentation

- Browser lock fix: Already implemented with `--isolated` flag
- Security improvements: See `SECURITY_UPDATE_NOTICE.md`
- Deployment guide: See `DEPLOYMENT_REMINDER.md`

## Next Steps

1. ✅ **Browser Args**: Fixed - environment variable is now passed through
2. ⚠️ **URL Extraction**: Requires fix in `@playwright/mcp` package (external dependency)
3. 🔄 **Action**: Report issue to `@playwright/mcp` maintainers or submit PR to fix parameter extraction

## Testing

After setting `PLAYWRIGHT_BROWSER_ARGS`, test navigation:

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

If URL extraction is fixed in `@playwright/mcp`, this should work. If not, you'll still see the "Invalid URL: undefined" error.
