# MCP Registry Configuration Guide

This guide explains how to register the Playwright MCP HTTP Server with an MCP registry using the 2025 Streamable-HTTP standard.

## Overview

The Playwright MCP HTTP Server supports the **Streamable-HTTP** transport protocol, which is the 2025 MCP standard for remote connections. This protocol requires HTTPS (which Cloud Run provides automatically) and bearer token authentication.

## Registry Entry Format

### Basic Configuration

```json
{
  "name": "playwright-service",
  "transport": "streamable-http",
  "url": "https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp",
  "auth": {
    "type": "bearer",
    "token": "YOUR_SECURE_TOKEN"
  }
}
```

### Configuration Fields

- **`name`**: A unique identifier for your service in the registry
- **`transport`**: Must be `"streamable-http"` for the 2025 standard
- **`url`**: The HTTPS endpoint of your deployed service (must end with `/mcp`)
- **`auth.type`**: Must be `"bearer"` for bearer token authentication
- **`auth.token`**: The bearer token configured in your deployment

## Getting Your Service URL

After deploying to Cloud Run, get your service URL:

```bash
gcloud run services describe playwright-mcp-http-server \
  --region us-central1 \
  --format 'value(status.url)'
```

The URL will look like: `https://playwright-mcp-http-server-XXXXX.us-central1.run.app`

## Getting Your Auth Token

### If Using Direct Token (AUTH_TOKEN)

If you deployed with `AUTH_MODE=token`, the token was displayed during deployment. You can also retrieve it from your environment:

```bash
echo $AUTH_TOKEN
```

### If Using Secret Manager (AUTH_SECRET_NAME)

If you deployed with `AUTH_MODE=secret`, retrieve the token from Secret Manager:

```bash
gcloud secrets versions access latest \
  --secret="playwright-mcp-auth-token" \
  --project="your-project-id"
```

## Deployment Authentication Modes

### 1. Public Access (Development Only)

**⚠️ Warning**: Not recommended for production. No authentication required.

```bash
export AUTH_MODE=public
./deploy-gcp.sh
```

**Registry Config**: No `auth` field needed (but service won't enforce auth)

```json
{
  "name": "playwright-service",
  "transport": "streamable-http",
  "url": "https://your-service-url.run.app/mcp"
}
```

### 2. Bearer Token (Recommended for Production)

Deploy with a direct token:

```bash
export AUTH_MODE=token
export AUTH_TOKEN="your-secure-random-token"
./deploy-gcp.sh
```

**Registry Config**:

```json
{
  "name": "playwright-service",
  "transport": "streamable-http",
  "url": "https://your-service-url.run.app/mcp",
  "auth": {
    "type": "bearer",
    "token": "your-secure-random-token"
  }
}
```

### 3. Secret Manager (Best for Production)

Deploy with Secret Manager:

```bash
export AUTH_MODE=secret
export AUTH_SECRET_NAME="playwright-mcp-auth-token"
./deploy-gcp.sh
```

The script will:
- Create the secret if it doesn't exist
- Generate a random token if not provided
- Grant Cloud Run access to the secret
- Display the token for registry configuration

**Registry Config** (use the token displayed during deployment):

```json
{
  "name": "playwright-service",
  "transport": "streamable-http",
  "url": "https://your-service-url.run.app/mcp",
  "auth": {
    "type": "bearer",
    "token": "token-displayed-during-deployment"
  }
}
```

## Streamable-HTTP Protocol Details

### Endpoints

1. **GET /mcp** (Server-Sent Events)
   - Opens a streaming connection for server-to-client messages
   - Requires `Accept: text/event-stream` header
   - Requires bearer token authentication
   - Sends notifications and updates via SSE

2. **POST /mcp** (JSON-RPC)
   - Sends client-to-server JSON-RPC messages
   - Requires bearer token authentication
   - Returns JSON-RPC responses

### Example Usage

#### Opening SSE Connection

```bash
curl -N -H "Accept: text/event-stream" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     https://your-service-url.run.app/mcp
```

#### Sending JSON-RPC Request

```bash
curl -X POST https://your-service-url.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

#### JavaScript/TypeScript Example

```typescript
// Open SSE connection for server-to-client messages
const eventSource = new EventSource(
  'https://your-service-url.run.app/mcp',
  {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN'
    }
  }
);

eventSource.onmessage = (event) => {
  const notification = JSON.parse(event.data);
  console.log('Server notification:', notification);
};

// Send JSON-RPC request
async function callMCP(method: string, params?: any) {
  const response = await fetch('https://your-service-url.run.app/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_TOKEN'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });
  return response.json();
}

// Use the service
const tools = await callMCP('tools/list');
await callMCP('tools/call', {
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' }
});
```

## Security Best Practices

1. **Use Strong Tokens**: Generate tokens using cryptographically secure random generators
   ```bash
   # Linux/Mac
   openssl rand -hex 32
   
   # PowerShell
   [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```

2. **Rotate Tokens Regularly**: Update tokens periodically and update registry configurations

3. **Use Secret Manager**: For production, always use GCP Secret Manager instead of direct tokens

4. **Restrict CORS**: Set `CORS_ORIGIN` environment variable to specific domains

5. **Monitor Access**: Use Cloud Run logs to monitor authentication failures

## Troubleshooting

### Authentication Errors

**Error**: `401 Unauthorized - Missing Authorization header`
- **Solution**: Ensure you're including the `Authorization: Bearer <token>` header

**Error**: `401 Unauthorized - Invalid token`
- **Solution**: Verify the token matches what was configured during deployment

**Error**: `500 Internal Error - Authentication not properly configured`
- **Solution**: Check that `AUTH_TOKEN` or `AUTH_SECRET_NAME` is set correctly in Cloud Run

### SSE Connection Issues

**Issue**: SSE connection closes immediately
- **Solution**: Ensure you're using `Accept: text/event-stream` header

**Issue**: No messages received over SSE
- **Solution**: SSE is for server-to-client notifications. Use POST for requests.

### Secret Manager Issues

**Error**: Permission denied accessing secret
- **Solution**: Grant the Cloud Run service account access:
  ```bash
  gcloud secrets add-iam-policy-binding playwright-mcp-auth-token \
    --member="serviceAccount:PROJECT_ID@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
  ```

## Example Registry Configurations

### Development Environment

```json
{
  "name": "playwright-dev",
  "transport": "streamable-http",
  "url": "https://playwright-mcp-dev-XXXXX.run.app/mcp",
  "auth": {
    "type": "bearer",
    "token": "dev-token-here"
  }
}
```

### Production Environment

```json
{
  "name": "playwright-prod",
  "transport": "streamable-http",
  "url": "https://playwright-mcp-prod-XXXXX.run.app/mcp",
  "auth": {
    "type": "bearer",
    "token": "production-token-from-secret-manager"
  }
}
```

## Next Steps

1. Deploy your service with authentication enabled
2. Retrieve your service URL and auth token
3. Add the registry entry to your MCP registry
4. Test the connection using the examples above
5. Monitor logs for any authentication or connection issues

For more information, see:
- [MCP Specification](https://modelcontextprotocol.io)
- [Streamable-HTTP Documentation](https://modelcontextprotocol.io/specification/transports/streamable-http)
- [GCP Cloud Run Documentation](https://cloud.google.com/run/docs)

