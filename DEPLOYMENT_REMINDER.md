# Deployment Reminder: Security & Browser Lock Fix

**Date**: January 2025  
**Action Required**: Redeploy service to apply changes

## Changes Made

1. ✅ Browser lock fix (`--isolated` flag added)
2. ✅ Rate limiting (100 req/15min per IP)
3. ✅ Request validation (URL validation)
4. ✅ Request timeouts (30 seconds)
5. ✅ Resource limits (max 5 concurrent browsers)
6. ✅ Enhanced logging (IP tracking)
7. ✅ Browser arguments support (`PLAYWRIGHT_BROWSER_ARGS` environment variable)

## Deployment Steps

### Option 1: Using Deployment Script (Recommended)

```bash
# Build and deploy
npm run build
./deploy-gcp.sh  # or deploy-gcp.ps1 on Windows
```

### Option 2: Manual Deployment

```bash
# Set your project ID
export GCP_PROJECT_ID="your-project-id"
export REGION="us-central1"
export SERVICE_NAME="playwright-mcp-http-server"

# Build Docker image
docker build -t gcr.io/${GCP_PROJECT_ID}/${SERVICE_NAME} .

# Push to registry
docker push gcr.io/${GCP_PROJECT_ID}/${SERVICE_NAME}

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
    --image gcr.io/${GCP_PROJECT_ID}/${SERVICE_NAME} \
    --region ${REGION} \
    --platform managed \
    --allow-unauthenticated \
    --port 8931 \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --max-instances 10 \
    --concurrency 10
```

### Option 3: Using Cloud Build (if configured)

```bash
# Trigger Cloud Build
gcloud builds submit --config cloudbuild.yaml
```

## Post-Deployment Verification

After deployment, verify the changes are active:

1. **Check logs** for security configuration:
   ```
   [Server] Security Configuration:
     - Rate limiting: 100 requests per 15 minutes
     - Request timeout: 30000ms
     - Max concurrent browsers: 5
   ```

2. **Test health endpoint**:
   ```bash
   curl https://playwright-mcp-http-server-554655392699.us-central1.run.app/health
   ```

3. **Test rate limiting** (optional):
   ```bash
   # Should receive 429 after 100 requests
   for i in {1..101}; do
     curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
       -H "Authorization: Bearer YOUR_TOKEN" \
       -H "Content-Type: application/json" \
       -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/list\"}"
   done
   ```

## Configuration Options

The new security features use default values but can be customized via environment variables:

```bash
# Optional: Customize security settings
gcloud run services update playwright-mcp-http-server \
  --update-env-vars "RATE_LIMIT_MAX=200,REQUEST_TIMEOUT_MS=60000,MAX_CONCURRENT_BROWSERS=10" \
  --region us-central1
```

### Browser Arguments for Cloud Run

For Cloud Run deployments, configure browser launch arguments:

```bash
gcloud run services update playwright-mcp-http-server \
  --update-env-vars "PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu" \
  --region us-central1
```

See `env.example` for all available configuration options.

## Notes

- **No breaking changes**: Existing clients continue to work without modifications
- **Backward compatible**: All changes are transparent to clients
- **Client notification**: See `SECURITY_UPDATE_NOTICE.md` for client team communication
