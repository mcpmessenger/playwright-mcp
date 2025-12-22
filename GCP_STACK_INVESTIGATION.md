# GCP Stack Investigation: HTTPS/Streamable-HTTP Migration

## Executive Summary

This investigation analyzes the current GCP Cloud Run deployment of the Playwright MCP HTTP Server to identify what needs to change to comply with the 2025 MCP specification requirement for Streamable-HTTP over HTTPS.

**Key Finding**: The service is already deployed to Cloud Run with HTTPS endpoints (Cloud Run provides automatic HTTPS), but the codebase and documentation do not explicitly configure or document the Streamable-HTTP transport protocol. The service currently uses basic HTTP POST requests for JSON-RPC, which needs to be enhanced to support the Streamable-HTTP standard.

---

## 1. Deployment Pipeline Analysis

### 1.1 Cloud Build Configuration (`cloudbuild.yaml`)

**Current Setup:**
- **Build Steps:**
  1. Builds Docker image with tags: `$SHORT_SHA` and `latest`
  2. Pushes both tags to GCR (Google Container Registry)
  3. Deploys to Cloud Run with these settings:
     - Service name: `playwright-mcp-http-server`
     - Region: `us-central1`
     - Platform: `managed`
     - **Authentication**: `--allow-unauthenticated` (public access)
     - Port: `8931`
     - Memory: `2Gi`
     - CPU: `2`
     - Timeout: `300` seconds
     - Max instances: `10`
     - Environment variables: `PLAYWRIGHT_HEADLESS=true,LOG_LEVEL=info`

**HTTPS Status**: ✅ **Cloud Run automatically provides HTTPS** for all deployed services. The service URL `https://playwright-mcp-http-server-554655392699.us-central1.run.app` is already HTTPS-enabled.

**Gaps Identified:**
- No authentication/authorization configured (uses `--allow-unauthenticated`)
- No bearer token or API key configuration
- No explicit Streamable-HTTP endpoint configuration
- No server-sent events (SSE) support for the Streamable-HTTP GET endpoint

### 1.2 Deployment Scripts

**`deploy-gcp.sh` (Linux/Mac):**
- Builds Docker image locally
- Pushes to GCR
- Deploys with same settings as `cloudbuild.yaml`
- Outputs service URL (which is HTTPS by default on Cloud Run)

**`deploy-gcp.ps1` (Windows PowerShell):**
- Same functionality as bash script
- Missing `PORT=8931` env var (present in bash script but not PowerShell)

**HTTPS Status**: ✅ Both scripts deploy to Cloud Run, which automatically provides HTTPS endpoints.

---

## 2. Server Configuration Analysis

### 2.1 Dockerfile

**Current Configuration:**
- **Base Image**: `node:18-slim`
- **Multi-stage Build**: Builder stage compiles TypeScript, runtime stage runs the server
- **Port Exposed**: `8931`
- **Health Check**: Uses HTTP (not HTTPS) for localhost health check - this is correct for internal container checks
- **Entry Point**: `node dist/server.js`

**HTTPS Considerations:**
- Container listens on HTTP (port 8931) internally - this is correct
- Cloud Run handles HTTPS termination at the edge
- No TLS/SSL configuration needed in the container itself

### 2.2 Server Code (`src/server.ts`)

**Current Endpoints:**
1. **GET /** - Service information (returns JSON with service metadata)
2. **GET /health** - Health check endpoint
3. **POST /mcp** - Main MCP protocol endpoint (JSON-RPC 2.0)

**Current Implementation:**
- Uses Express.js with CORS middleware
- Accepts JSON-RPC 2.0 POST requests
- Returns JSON responses
- No server-sent events (SSE) support
- No GET endpoint for `/mcp` with `Accept: text/event-stream` header

**Streamable-HTTP Gaps:**
- ❌ Missing GET endpoint for `/mcp` that accepts `Accept: text/event-stream`
- ❌ No SSE (Server-Sent Events) implementation for server-to-client streaming
- ❌ Current implementation only supports request-response pattern, not bidirectional streaming

### 2.3 Configuration (`src/config.ts`)

**Environment Variables:**
- `PORT` (default: 8931)
- `PLAYWRIGHT_BROWSER` (default: chromium)
- `PLAYWRIGHT_HEADLESS` (default: true)
- `LOG_LEVEL` (default: info)
- `MAX_SESSIONS` (optional)
- `SESSION_TIMEOUT` (optional)
- `CORS_ORIGIN` (default: "*")

**Missing Configuration:**
- No authentication token configuration
- No Streamable-HTTP specific settings
- No CORS configuration for SSE endpoints

### 2.4 MCP Handler (`src/mcp-handler.ts`)

**Current Implementation:**
- Bridges HTTP requests to Playwright MCP process via STDIO
- Handles JSON-RPC 2.0 protocol
- No streaming support
- Synchronous request-response pattern only

**Streamable-HTTP Requirements:**
- Need to support bidirectional communication
- Need to handle server-sent events for server-to-client messages
- Need to maintain session state for streaming connections

---

## 3. Registry Configuration Gaps

### 3.1 Current State

**No Registry Configuration Found:**
- No registry configuration files in the codebase
- No documentation on how to register this service with an MCP registry
- No example registry entries showing transport configuration

### 3.2 What Needs to Be Added

**Registry Entry Format (2025 Standard):**
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

**Required Changes:**
1. **Authentication**: Currently deployed with `--allow-unauthenticated`. Need to:
   - Either add bearer token authentication to the server
   - Or configure Cloud Run IAM for authenticated access
   - Or use API keys via Cloud Run API key restrictions

2. **Streamable-HTTP Endpoint**: Need to implement:
   - GET `/mcp` endpoint that accepts `Accept: text/event-stream` header
   - SSE (Server-Sent Events) support for server-to-client streaming
   - Maintain connection state for long-lived streaming connections

3. **Documentation**: Need to add:
   - Registry configuration examples
   - Authentication setup instructions
   - Streamable-HTTP usage examples

---

## 4. Cloud Run HTTPS Configuration

### 4.1 Current HTTPS Status

✅ **HTTPS is Already Enabled**
- Cloud Run automatically provides HTTPS for all services
- The service URL `https://playwright-mcp-http-server-554655392699.us-central1.run.app` is HTTPS
- SSL/TLS termination happens at the Cloud Run edge
- No additional configuration needed for HTTPS

### 4.2 Authentication Options

**Option 1: Bearer Token (Recommended for MCP)**
- Add bearer token validation middleware to Express server
- Store token in GCP Secret Manager
- Update Cloud Run deployment to use secret
- Update registry config to include bearer token

**Option 2: Cloud Run IAM**
- Remove `--allow-unauthenticated` flag
- Use `gcloud auth print-identity-token` for authentication
- More complex for MCP clients to use

**Option 3: API Keys**
- Configure Cloud Run API key restrictions
- Simpler than IAM but less secure than bearer tokens

---

## 5. Implementation Requirements for Streamable-HTTP

### 5.1 Code Changes Needed

1. **Add SSE Support to Server** (`src/server.ts`):
   - Implement GET `/mcp` endpoint
   - Check for `Accept: text/event-stream` header
   - Set up SSE connection with proper headers
   - Maintain connection state

2. **Update MCP Handler** (`src/mcp-handler.ts`):
   - Support bidirectional communication
   - Handle streaming responses
   - Manage session state for long-lived connections

3. **Add Authentication Middleware**:
   - Bearer token validation
   - Optional: API key support
   - Integration with GCP Secret Manager

4. **Update Configuration** (`src/config.ts`):
   - Add `AUTH_TOKEN` or `AUTH_SECRET_NAME` environment variable
   - Add Streamable-HTTP specific settings

### 5.2 Deployment Changes Needed

1. **Update `cloudbuild.yaml`**:
   - Add secret reference for auth token
   - Update environment variables

2. **Update Deployment Scripts**:
   - Add secret creation/management
   - Update service deployment with auth configuration

3. **Update Documentation**:
   - Add registry configuration examples
   - Add authentication setup guide
   - Add Streamable-HTTP usage examples

---

## 6. Security Considerations

### 6.1 Current Security Status

⚠️ **Security Debt Identified:**
- Service is publicly accessible (`--allow-unauthenticated`)
- No authentication/authorization
- No rate limiting
- No request validation beyond JSON-RPC structure

### 6.2 Recommended Security Enhancements

1. **Add Authentication**:
   - Bearer token authentication (required for registry)
   - Store tokens in GCP Secret Manager
   - Rotate tokens regularly

2. **Add Rate Limiting**:
   - Prevent abuse
   - Cloud Run has built-in rate limiting, but application-level is better

3. **Add Request Validation**:
   - Validate MCP protocol version
   - Sanitize inputs
   - Add request size limits

4. **Enable Cloud Armor** (Optional):
   - DDoS protection
   - WAF rules
   - Geographic restrictions

---

## 7. Summary of Findings

### ✅ What's Already Working

1. **HTTPS**: Cloud Run automatically provides HTTPS - no changes needed
2. **Deployment Pipeline**: Cloud Build and deployment scripts are functional
3. **Basic MCP Protocol**: JSON-RPC 2.0 implementation is working
4. **Health Checks**: Health endpoint is properly configured

### ❌ What Needs to Be Fixed

1. **Streamable-HTTP Support**: 
   - Missing GET endpoint with SSE support
   - No bidirectional streaming
   - Only supports request-response pattern

2. **Authentication**:
   - No authentication configured
   - Public access is a security risk
   - Need bearer token support for registry

3. **Registry Configuration**:
   - No registry configuration examples
   - No documentation on how to register the service
   - Missing transport configuration examples

4. **Documentation**:
   - Need to document Streamable-HTTP usage
   - Need to add registry configuration guide
   - Need authentication setup instructions

### 🎯 Priority Actions

1. **High Priority**: Implement Streamable-HTTP GET endpoint with SSE support
2. **High Priority**: Add bearer token authentication
3. **Medium Priority**: Update registry configuration documentation
4. **Medium Priority**: Add security enhancements (rate limiting, validation)
5. **Low Priority**: Add Cloud Armor configuration (optional)

---

## 8. Next Steps

1. Implement Streamable-HTTP GET endpoint with SSE support
2. Add bearer token authentication middleware
3. Update deployment scripts to configure authentication
4. Create registry configuration documentation
5. Update README with Streamable-HTTP examples
6. Test with MCP registry to ensure compliance

---

**Investigation Date**: December 20, 2025  
**Investigator**: AI Assistant  
**Status**: Complete - Ready for Implementation

