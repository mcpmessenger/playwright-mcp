# Client-Side Update Notice: Streamable-HTTP Migration

**Date**: December 20, 2025  
**Status**: Required Update  
**Priority**: High

---

## Summary

The Playwright MCP HTTP Server has been updated to comply with the **2025 MCP Specification**, which mandates the use of **Streamable-HTTP over HTTPS** for all remote connections. This update requires changes to your MCP registry client configurations.

## Why This Update is Mandated

### 1. **2025 MCP Standard Compliance**

The Model Context Protocol (MCP) specification has been updated for 2025, and **Streamable-HTTP is now the standard transport protocol** for remote MCP connections. This effectively mandates HTTPS for any remote connection.

### 2. **Security Requirements**

The previous HTTP-only setup created significant security risks:

- **Credential Sniffing**: Browser sessions, cookies, and login credentials were sent in plain text
- **Man-in-the-Middle (MITM) Attacks**: Attackers could intercept and modify MCP messages, potentially changing code execution
- **Browser Security Policies**: Many modern web features require Secure Contexts (HTTPS)

### 3. **Production Readiness**

Moving to HTTPS and Streamable-HTTP ensures:
- ✅ Encrypted communication end-to-end
- ✅ Protection against credential theft
- ✅ Compliance with modern security standards
- ✅ Compatibility with browser security policies

## What Changed

### Service Updates

1. **HTTPS Enabled**: Service now requires HTTPS (automatically provided by Cloud Run)
2. **Authentication Required**: Bearer token authentication is now mandatory for production
3. **Streamable-HTTP Protocol**: Implements the 2025 standard with:
   - **GET `/mcp`**: Server-Sent Events (SSE) for server-to-client streaming
   - **POST `/mcp`**: JSON-RPC for client-to-server messages

### Deployment Details

- **Service URL**: `https://playwright-mcp-http-server-554655392699.us-central1.run.app`
- **Authentication**: Bearer token stored in GCP Secret Manager
- **Transport**: `streamable-http` (2025 MCP standard)

## Required Client-Side Changes

### 1. Update Registry Configuration

You **must** update your MCP registry configuration to include authentication:

**Before (Old Configuration - No Longer Works):**
```json
{
  "name": "playwright-service",
  "transport": "http",
  "url": "http://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp"
}
```

**After (New Configuration - Required):**
```json
{
  "name": "playwright-service",
  "transport": "streamable-http",
  "url": "https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp",
  "auth": {
    "type": "bearer",
    "token": "playwright-mcp-token-734323882"
  }
}
```

### 2. Update Client Code

Your MCP client code must now:

1. **Include Authorization Header** on all requests:
   ```typescript
   headers: {
     'Authorization': 'Bearer playwright-mcp-token-734323882',
     'Content-Type': 'application/json'
   }
   ```

2. **Use HTTPS URLs** (not HTTP):
   - ✅ `https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp`
   - ❌ `http://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp`

3. **Support Streamable-HTTP** (if using SSE):
   ```typescript
   // For server-to-client notifications
   const eventSource = new EventSource(url, {
     headers: {
       'Authorization': 'Bearer playwright-mcp-token-734323882'
     }
   });
   ```

### 3. Authentication Token

**Token**: `playwright-mcp-token-734323882`

**Important**: 
- Keep this token secure and do not commit it to version control
- Store it in environment variables or secure configuration
- Contact the DevOps team if you need token rotation

## Migration Checklist

- [ ] Update registry configuration with new HTTPS URL
- [ ] Add `transport: "streamable-http"` to registry config
- [ ] Add `auth` section with bearer token to registry config
- [ ] Update client code to include `Authorization` header
- [ ] Replace all HTTP URLs with HTTPS URLs
- [ ] Test connection with new authentication
- [ ] Update documentation and examples
- [ ] Remove any hardcoded HTTP URLs

## Testing

After updating your configuration, test the connection:

```bash
# Test health endpoint
curl https://playwright-mcp-http-server-554655392699.us-central1.run.app/health

# Test MCP endpoint with authentication
curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
  -H "Authorization: Bearer playwright-mcp-token-734323882" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

## Timeline

- **Effective Date**: December 20, 2025
- **Old HTTP endpoints**: Will be deprecated
- **Action Required**: Update client configurations immediately

## Support

If you encounter any issues:

1. **Authentication Errors**: Verify the bearer token is correct
2. **Connection Errors**: Ensure you're using HTTPS (not HTTP)
3. **Transport Errors**: Verify `transport: "streamable-http"` is set

**Contact**: DevOps Team or refer to [REGISTRY_CONFIG.md](./REGISTRY_CONFIG.md) for detailed setup instructions.

## Security Benefits

This update provides:

- 🔒 **Encrypted Communication**: All data is encrypted in transit
- 🛡️ **Authentication**: Prevents unauthorized access
- ✅ **Standards Compliance**: Meets 2025 MCP specification requirements
- 🚀 **Production Ready**: Suitable for production environments

---

**Note**: This is a **mandatory update** required for compliance with the 2025 MCP specification. All client-side configurations must be updated to use HTTPS and bearer token authentication.

