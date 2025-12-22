# Playwright MCP HTTP Server

A standalone HTTP service that wraps the official `@playwright/mcp` package to provide browser automation capabilities via HTTP endpoints. This service enables the use of Playwright MCP in serverless environments where STDIO-based communication is not possible.

## Features

- 🌐 **Streamable-HTTP Transport** - Implements the 2025 MCP standard for remote connections
- 🔒 **Bearer Token Authentication** - Secure authentication required for production use
- 🚀 **Serverless Compatible** - Works in serverless/cloud environments (Railway, Render, Fly.io, GCP Cloud Run, etc.)
- 🔄 **MCP v0.1 Compatible** - Fully implements the Model Context Protocol specification
- 📡 **Server-Sent Events (SSE)** - Bidirectional streaming support for real-time notifications
- 🎭 **Full Playwright Support** - All Playwright browser automation tools available
- 🐳 **Docker Ready** - Includes Dockerfile for easy containerization
- ⚡ **Production Ready** - Health checks, graceful shutdown, error handling
- ☁️ **Live Deployment** - Pre-deployed to Google Cloud Run with HTTPS (see below)

## Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/mcpmessenger/playwright-mcp.git
cd playwright-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

The server will start on port `8931` by default. You can access:

- **Service Info**: http://localhost:8931/
- **Health Check**: http://localhost:8931/health
- **MCP Endpoint**: http://localhost:8931/mcp
  - **POST** - Send JSON-RPC messages (client-to-server)
  - **GET** - Open SSE connection (server-to-client) with `Accept: text/event-stream`

### 🚀 Live Production Instance

The service is deployed to Google Cloud Run and ready to use:

- **Service URL**: https://playwright-mcp-http-server-554655392699.us-central1.run.app
- **Health Check**: https://playwright-mcp-http-server-554655392699.us-central1.run.app/health
- **MCP Endpoint**: https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp (POST only)

You can use the live instance immediately without deploying your own. See [Usage Examples](#example-usage) below.

### Development

```bash
# Run in development mode with auto-reload
npm run dev
```

## Configuration

Configuration is done via environment variables. Create a `.env` file or set environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8931` | HTTP server port |
| `PLAYWRIGHT_BROWSER` | `chromium` | Browser type (chromium, firefox, webkit) |
| `PLAYWRIGHT_HEADLESS` | `true` | Run browser in headless mode |
| `LOG_LEVEL` | `info` | Logging level (error, warn, info, debug) |
| `MAX_SESSIONS` | (unlimited) | Maximum concurrent browser sessions |
| `SESSION_TIMEOUT` | (none) | Session timeout in seconds |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `AUTH_TOKEN` | (none) | Bearer token for authentication (required for production) |
| `AUTH_SECRET_NAME` | (none) | GCP Secret Manager secret name (alternative to AUTH_TOKEN) |
| `GCP_PROJECT_ID` | (auto) | GCP project ID (required if using AUTH_SECRET_NAME) |

See `.env.example` for a template.

## Authentication

**⚠️ Important**: For production deployments, authentication is required to comply with the 2025 MCP Streamable-HTTP standard.

### Setting Up Authentication

1. **Direct Token** (Development/Testing):
   ```bash
   export AUTH_TOKEN="your-secure-token-here"
   ```

2. **GCP Secret Manager** (Production - Recommended):
   ```bash
   export AUTH_SECRET_NAME="playwright-mcp-auth-token"
   export GCP_PROJECT_ID="your-project-id"
   ```

See [REGISTRY_CONFIG.md](./REGISTRY_CONFIG.md) for detailed authentication setup instructions.

### Using Authentication

All requests to `/mcp` require a bearer token:

```bash
curl -X POST http://localhost:8931/mcp \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

## API Documentation

### POST /mcp

Main MCP protocol endpoint for client-to-server messages. Accepts JSON-RPC 2.0 messages.

**Authentication**: Required (Bearer token)

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "browser_navigate",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Navigation completed"
      }
    ],
    "isError": false
  }
}
```

### GET /health

Health check endpoint. Returns service status.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "timestamp": "2024-12-01T12:00:00.000Z"
}
```

### GET /

Service information endpoint.

**Response:**
```json
{
  "name": "Playwright MCP HTTP Server",
  "version": "1.0.0",
  "protocol": "MCP v0.1",
  "endpoints": {
    "mcp": "/mcp",
    "health": "/health"
  }
}
```

## Supported MCP Methods

The server supports all standard MCP methods:

- `initialize` - Initialize MCP connection
- `initialized` - Confirm initialization
- `tools/list` - List available Playwright tools
- `tools/call` - Invoke a Playwright tool

### Available Playwright Tools

All tools from `@playwright/mcp` are supported:

- `browser_navigate` - Navigate to a URL
- `browser_snapshot` - Get accessibility snapshot
- `browser_take_screenshot` - Capture screenshot
- `browser_click` - Click an element
- `browser_type` - Type text
- `browser_fill_form` - Fill form fields
- `browser_evaluate` - Execute JavaScript
- `browser_wait_for` - Wait for conditions
- `browser_close` - Close browser/page

For detailed tool parameters, see the [Playwright MCP documentation](https://github.com/microsoft/playwright-mcp).

## Using the Server

- Start locally with `npm install`, build (`npm run build`), then run `npm start` (or use `npm run dev` for auto-reload during development).
- Call `/`, `/health`, or `/mcp` via curl/Postman/Playwright MCP clients; the `/mcp` endpoint accepts JSON-RPC POST requests (see the example below).
- Adjust behavior by editing `.env` or setting env vars such as `PORT`, `PLAYWRIGHT_BROWSER`, and `PLAYWRIGHT_HEADLESS`.
- Alternatively, containerize the service with `docker build -t playwright-mcp-http-server .` and `docker run -p 8931:8931 ...` for consistent deployments.

## Updating the GitHub Repository

- Pull the latest changes before making edits: `git pull --rebase origin main`.
- Use `git status` to see touched files, then stage with `git add <files>` and commit with a descriptive message.
- Push your branch with `git push origin HEAD` and open a pull request if the change needs review.

## Example Usage

### Using curl

```bash
# List available tools
curl -X POST http://localhost:8931/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# Navigate to a page
curl -X POST http://localhost:8931/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "browser_navigate",
      "arguments": {
        "url": "https://example.com"
      }
    }
  }'

# Take a screenshot
curl -X POST http://localhost:8931/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "browser_take_screenshot",
      "arguments": {
        "fullPage": true
      }
    }
  }'
```

### Using JavaScript/TypeScript

```typescript
// Use the live production instance or replace with your own deployment URL
const MCP_SERVER_URL = 'https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp';
const AUTH_TOKEN = 'your-token-here'; // Required for production

// Open SSE connection for server-to-client notifications
const eventSource = new EventSource(MCP_SERVER_URL, {
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`
  }
});

eventSource.onmessage = (event) => {
  const notification = JSON.parse(event.data);
  console.log('Server notification:', notification);
};

eventSource.onerror = (error) => {
  console.error('SSE connection error:', error);
};

// Send JSON-RPC requests (client-to-server)
async function callPlaywrightMCP(method: string, params?: any) {
  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });
  return response.json();
}

// List tools
const tools = await callPlaywrightMCP('tools/list');

// Navigate
await callPlaywrightMCP('tools/call', {
  name: 'browser_navigate',
  arguments: { url: 'https://example.com' },
});

// Take screenshot
const screenshot = await callPlaywrightMCP('tools/call', {
  name: 'browser_take_screenshot',
  arguments: { fullPage: true },
});
```

**Note**: For production, always use HTTPS and include the bearer token in the `Authorization` header.

### GET /mcp (Streamable-HTTP)

Opens a Server-Sent Events (SSE) connection for server-to-client messages. This implements the Streamable-HTTP transport protocol.

**Authentication**: Required (Bearer token)  
**Headers**: `Accept: text/event-stream`

**Example:**
```bash
curl -N -H "Accept: text/event-stream" \
     -H "Authorization: Bearer your-token-here" \
     http://localhost:8931/mcp
```

The connection will:
- Send connection confirmation
- Forward MCP notifications from the Playwright process
- Send periodic ping messages to keep the connection alive
- Close gracefully when the client disconnects

**Note**: 
- POST `/mcp` is for sending JSON-RPC requests (client-to-server)
- GET `/mcp` is for receiving notifications via SSE (server-to-client)
- Both endpoints require authentication when `AUTH_TOKEN` or `AUTH_SECRET_NAME` is set

## Deployment

### Railway

1. Create a new Railway project
2. Connect your Git repository
3. Railway will auto-detect Node.js and use `npm start`
4. Set environment variables if needed
5. Deploy!

The service will use Railway's `$PORT` environment variable automatically.

### Render

1. Create a new Web Service on Render
2. Connect your Git repository
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Set environment variables if needed
6. Deploy!

### Google Cloud Platform (Cloud Run)

See [DEPLOY_GCP.md](./DEPLOY_GCP.md) for detailed instructions.

**Quick deploy with authentication:**

```bash
# Set your project ID
export GCP_PROJECT_ID="your-project-id"

# Option 1: Deploy with bearer token (recommended)
export AUTH_MODE=token
export AUTH_TOKEN=$(openssl rand -hex 32)  # Generate secure token
chmod +x deploy-gcp.sh && ./deploy-gcp.sh

# Option 2: Deploy with Secret Manager (best for production)
export AUTH_MODE=secret
export AUTH_SECRET_NAME="playwright-mcp-auth-token"
chmod +x deploy-gcp.sh && ./deploy-gcp.sh

# Option 3: Deploy without authentication (development only - NOT recommended)
export AUTH_MODE=public
chmod +x deploy-gcp.sh && ./deploy-gcp.sh
```

**Windows PowerShell:**
```powershell
$env:GCP_PROJECT_ID = "your-project-id"
$env:AUTH_MODE = "token"
$env:AUTH_TOKEN = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
.\deploy-gcp.ps1 -ProjectId "your-project-id"
```

**⚠️ Security Note**: Always use authentication (`AUTH_MODE=token` or `AUTH_MODE=secret`) for production deployments. Public access (`AUTH_MODE=public`) should only be used for local development.

Or manually:

```bash
PROJECT_ID="your-project-id"
IMAGE="gcr.io/${PROJECT_ID}/playwright-mcp-http-server"

docker build -t $IMAGE .
docker push $IMAGE

gcloud run deploy playwright-mcp-http-server \
    --image $IMAGE \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --port 8931 \
    --memory 2Gi \
    --cpu 2
```

### Fly.io

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. Launch app: `fly launch`
4. Deploy: `fly deploy`

### Docker

```bash
# Build the image
docker build -t playwright-mcp-http-server .

# Run the container
docker run -p 8931:8931 playwright-mcp-http-server

# With environment variables
docker run -p 8931:8931 \
  -e PORT=8931 \
  -e PLAYWRIGHT_HEADLESS=true \
  playwright-mcp-http-server
```

### Docker Compose

```yaml
version: '3.8'
services:
  playwright-mcp:
    build: .
    ports:
      - "8931:8931"
    environment:
      - PORT=8931
      - PLAYWRIGHT_HEADLESS=true
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8931/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Streamable-HTTP (2025 MCP Standard)

This service implements the **Streamable-HTTP** transport protocol, which is the 2025 MCP standard for remote connections. Streamable-HTTP requires:

- ✅ **HTTPS** - Automatically provided by Cloud Run
- ✅ **Bearer Token Authentication** - Required for production use
- ✅ **Server-Sent Events (SSE)** - For server-to-client streaming
- ✅ **POST Endpoint** - For client-to-server JSON-RPC messages

### Registry Configuration

To register this service with an MCP registry, use this configuration:

```json
{
  "name": "playwright-service",
  "transport": "streamable-http",
  "url": "https://your-service-url.run.app/mcp",
  "auth": {
    "type": "bearer",
    "token": "your-secure-token"
  }
}
```

See [REGISTRY_CONFIG.md](./REGISTRY_CONFIG.md) for complete registry setup instructions.

## Architecture

The service works by:

1. **HTTP Server** (Express) receives JSON-RPC requests and SSE connections
2. **Authentication Middleware** validates bearer tokens
3. **MCP Handler** processes the requests and routes them to Playwright
4. **Playwright Process Manager** spawns `@playwright/mcp` as a child process
5. **STDIO Communication** handles JSON-RPC messages via stdin/stdout
6. **SSE Streaming** forwards server notifications to connected clients
7. **Response** is formatted and returned via HTTP

This architecture allows the Playwright process to run independently while being accessible via HTTP/HTTPS with full Streamable-HTTP support.

## Troubleshooting

### Service won't start

- Check that Node.js 18+ is installed: `node --version`
- Verify dependencies are installed: `npm install`
- Check logs for error messages

### Playwright browser not found

- The browser will be downloaded automatically on first run
- For Docker, ensure system dependencies are installed (included in Dockerfile)
- Check network connectivity for browser downloads

### High memory usage

- Consider setting `MAX_SESSIONS` to limit concurrent sessions
- Ensure `browser_close` is called when done with a session
- Monitor for memory leaks in long-running processes

### Timeout errors

- Increase request timeout if operations take longer than 30 seconds
- Check network connectivity to target URLs
- Verify Playwright process is not crashed

## Development

### Project Structure

```
playwright-mcp-http-server/
├── src/
│   ├── server.ts              # HTTP server setup
│   ├── mcp-handler.ts         # MCP protocol handler
│   ├── playwright-process.ts  # Playwright process management
│   ├── config.ts              # Configuration
│   └── types/
│       └── mcp.ts             # TypeScript types
├── dist/                      # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

### Building

```bash
npm run build
```

### Running Tests

*Note: Tests are not yet implemented but planned for future releases*

## License

MIT

## References

- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [MCP Specification](https://modelcontextprotocol.io)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Playwright Documentation](https://playwright.dev)

## Support

For issues and questions, please open an issue on the repository.

