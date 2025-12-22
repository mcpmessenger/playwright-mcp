# Browser Arguments Support Update

**Date**: January 2025  
**Status**: Update Available  
**Priority**: Medium

---

## Summary

The Playwright MCP HTTP Server now supports custom browser launch arguments via the `PLAYWRIGHT_BROWSER_ARGS` environment variable. This enables proper browser operation in containerized environments like Cloud Run.

## What Changed

### ✅ Browser Arguments Support

The server now passes browser launch arguments to the Playwright MCP process, allowing configuration of Chrome/Chromium flags required for containerized deployments.

**Use Case**: Cloud Run and other containerized environments where Chrome needs special flags like `--no-sandbox` to run as root.

## Impact on Clients

### ✅ No Breaking Changes

**No client-side code changes are required.** This is a server-side configuration improvement only.

### Server Configuration

Server administrators can now configure browser launch arguments via environment variable:

```bash
PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage
```

## For Server Administrators

### Cloud Run Deployment

To enable browser arguments for Cloud Run deployments:

```bash
gcloud run services update playwright-mcp-http-server \
  --update-env-vars "PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu" \
  --region=us-central1
```

### Recommended Browser Arguments for Cloud Run

- `--no-sandbox` - Required for running Chrome as root (Cloud Run default)
- `--disable-setuid-sandbox` - Additional sandbox disable flag
- `--disable-dev-shm-usage` - Overcome limited `/dev/shm` in containers
- `--disable-gpu` - Disable GPU (not available in Cloud Run)

### Example Configuration

```bash
# In .env file or environment variables
PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu
```

## Known Limitations

### ⚠️ URL Parameter Extraction Issue

There is a known issue with URL parameter extraction in the `@playwright/mcp` package (external dependency):

- **Error**: `SyntaxError: browserType.launch: Invalid URL: undefined`
- **Impact**: Browser navigation may fail
- **Status**: Being tracked - requires fix in `@playwright/mcp` package
- **Workaround**: None available at this time

This issue is documented in `PLAYWRIGHT_BROWSER_ARGS_ISSUE.md`.

## Testing

After deployment, test browser navigation:

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

## Benefits

This update provides:

- 🔧 **Container Support**: Enables proper browser operation in containerized environments
- ⚙️ **Flexibility**: Allows customization of browser launch arguments
- 🔒 **Security**: Supports secure browser operation in restricted environments
- ☁️ **Cloud Run**: Enables proper Chrome operation in Cloud Run deployments

## Related Documentation

- Browser lock fix: See `SECURITY_UPDATE_NOTICE.md`
- Security improvements: See `SECURITY_UPDATE_NOTICE.md`
- Deployment guide: See `DEPLOYMENT_REMINDER.md`
- Browser args details: See `PLAYWRIGHT_BROWSER_ARGS_ISSUE.md`

---

**Note**: This is a server-side configuration update. No client code changes are required. Server administrators should configure `PLAYWRIGHT_BROWSER_ARGS` for containerized deployments.
