# Security & Stability Update Notice

**Date**: January 2025  
**Status**: Recommended Update  
**Priority**: Medium

---

## Summary

The Playwright MCP HTTP Server has been updated with critical security improvements and a bug fix for browser lock issues. These changes improve service stability and protect against abuse while maintaining full backward compatibility with existing clients.

## What Changed

### 🔧 Bug Fix: Browser Lock Issue

**Problem**: When multiple requests called browser tools simultaneously, the server would fail with:
```
Error: Browser is already in use for /root/.cache/ms-playwright/mcp-chrome, use --isolated to run multiple instances
```

**Solution**: Added `--isolated` flag to Playwright spawn command, allowing multiple concurrent browser operations without conflicts.

**Impact**: 
- ✅ **No client-side changes required**
- ✅ Multiple concurrent requests now work reliably
- ✅ Improved service stability

### 🔒 Security Improvements (Phase 1)

The following security measures have been implemented to protect the service from abuse:

#### 1. Rate Limiting
- **Limit**: 100 requests per 15 minutes per IP address
- **Purpose**: Prevents abuse and DDoS attacks
- **Behavior**: Requests exceeding the limit receive HTTP 429 with JSON-RPC error response
- **Exception**: Health check endpoint (`/health`) is exempt from rate limiting

#### 2. Request Validation
- **URL Validation**: Validates all URLs in `browser_navigate` tool calls
- **Protocol Restriction**: Only HTTP(S) URLs are allowed (blocks `file://`, `javascript:`, etc.)
- **Domain Whitelist** (Optional): Can be configured via `ALLOWED_DOMAINS` environment variable
  - If not configured, all HTTP(S) URLs are allowed (current default for beta)
  - Can be restricted to specific domains for production

#### 3. Request Timeout
- **Timeout**: 30 seconds maximum execution time per request
- **Purpose**: Prevents resource exhaustion from hanging requests
- **Behavior**: Requests exceeding timeout receive HTTP 408 with JSON-RPC error response

#### 4. Resource Limits
- **Concurrent Operations**: Maximum 5 concurrent browser operations per instance
- **Purpose**: Prevents resource exhaustion
- **Behavior**: Additional requests receive JSON-RPC error when limit is reached

#### 5. Enhanced Logging & Monitoring
- **IP Tracking**: All requests are logged with client IP addresses
- **Suspicious Activity Detection**: Alerts logged when IP exceeds 1000 requests
- **Improved Logging**: Enhanced request logging with duration and status codes

## Impact on Clients

### ✅ No Breaking Changes

**All existing client code will continue to work without modifications.** The security improvements are transparent to clients and do not require any code changes.

### Rate Limit Handling

If your client makes many requests quickly, you may encounter rate limit errors:

**Error Response (HTTP 429)**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32002,
    "message": "Rate Limit Exceeded",
    "data": "Too many requests from this IP, please try again after 15 minutes."
  }
}
```

**Recommended Client Behavior**:
- Implement exponential backoff when receiving rate limit errors
- Cache responses when possible to reduce request count
- Batch operations when feasible
- Monitor your request rate to stay within limits

### Timeout Handling

Long-running browser operations may hit the 30-second timeout:

**Error Response (HTTP 408)**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Request Timeout",
    "data": "Request exceeded maximum execution time of 30000ms"
  }
}
```

**Recommended Client Behavior**:
- Break large operations into smaller requests
- Implement timeout handling and retry logic
- Consider using streaming/chunked approaches for long operations

### Concurrent Operation Limits

When all 5 concurrent browser slots are in use, new requests will receive:

**Error Response (HTTP 500)**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal Error",
    "data": "Maximum concurrent browser operations (5) reached. Please try again later."
  }
}
```

**Recommended Client Behavior**:
- Implement retry logic with backoff when encountering this error
- Queue requests on the client side if needed
- Consider parallel request throttling in your client

## Configuration (Server-Side)

These security settings can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `REQUEST_TIMEOUT_MS` | `30000` | Request timeout in milliseconds |
| `MAX_CONCURRENT_BROWSERS` | `5` | Max concurrent browser operations |
| `ALLOWED_DOMAINS` | (none - all allowed) | Comma-separated list of allowed domains |

**Example Configuration** (for production with domain restrictions):
```bash
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
REQUEST_TIMEOUT_MS=30000
MAX_CONCURRENT_BROWSERS=5
ALLOWED_DOMAINS=google.com,wikipedia.org,example.com
```

## Testing Recommendations

After deployment, test the following scenarios:

### 1. Test Rate Limiting
```bash
# Send 101 requests (should hit rate limit on last request)
for i in {1..101}; do
  curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/list\"}"
done
```

### 2. Test Concurrent Operations
```bash
# Send 6 concurrent requests (5 should succeed, 1 should hit limit)
for i in {1..6}; do
  curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/call\",\"params\":{\"name\":\"browser_navigate\",\"arguments\":{\"url\":\"https://example.com\"}}}" &
done
wait
```

### 3. Test URL Validation
```bash
# Should fail (malicious URL)
curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"browser_navigate","arguments":{"url":"file:///etc/passwd"}}}'
```

## Deployment Status

- ✅ **Code Changes**: Complete
- ⏳ **Deployment**: Pending (redeployment required)
- ⏳ **Client Testing**: Recommended after deployment

## Migration Checklist (Client Team)

- [ ] Review rate limit error handling in client code
- [ ] Implement exponential backoff for rate limit errors
- [ ] Review timeout handling (30 seconds max)
- [ ] Test concurrent request scenarios
- [ ] Monitor request rates to stay within limits
- [ ] Update client documentation if needed

## Support

If you encounter any issues:

1. **Rate Limit Errors**: Reduce request frequency or implement backoff
2. **Timeout Errors**: Break operations into smaller chunks
3. **Concurrent Limit Errors**: Implement request queuing/throttling
4. **Browser Lock Errors**: Should no longer occur (fixed in this update)

**Contact**: DevOps Team for questions or concerns about these changes.

## Benefits

This update provides:

- 🐛 **Bug Fix**: Browser lock issue resolved
- 🛡️ **Security**: Protection against abuse and DDoS
- 📊 **Monitoring**: Enhanced logging for troubleshooting
- ⚡ **Performance**: Better resource management
- 🔒 **Stability**: Improved service reliability

---

**Note**: While no client-side code changes are required, we recommend reviewing error handling in your clients to gracefully handle rate limits and timeouts for the best user experience.
