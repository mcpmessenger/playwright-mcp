# GCP Cloud Run Deployment Guide

This guide will help you deploy the Playwright MCP HTTP Server to Google Cloud Platform (GCP) Cloud Run using the CLI.

## Prerequisites

1. **Google Cloud Account**: Sign up at [cloud.google.com](https://cloud.google.com)
2. **gcloud CLI**: Install from [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)
3. **Docker**: Install from [docker.com](https://www.docker.com/get-started)
4. **GCP Project**: Create a project in the [GCP Console](https://console.cloud.google.com)

## Quick Start

### 1. Authenticate with GCP

```bash
# Login to GCP
gcloud auth login

# Set your project ID
gcloud config set project YOUR_PROJECT_ID

# Enable Application Default Credentials for Docker
gcloud auth configure-docker
```

### 2. Deploy Using Script (Recommended)

#### On Linux/Mac:

```bash
# Set your project ID
export GCP_PROJECT_ID="your-project-id"

# Make script executable
chmod +x deploy-gcp.sh

# Run deployment
./deploy-gcp.sh
```

#### On Windows (PowerShell):

```powershell
# Set your project ID
$env:GCP_PROJECT_ID = "your-project-id"

# Run deployment
.\deploy-gcp.ps1 -ProjectId "your-project-id"
```

### 3. Manual Deployment

If you prefer to deploy manually:

```bash
# Set variables
PROJECT_ID="your-project-id"
REGION="us-central1"
SERVICE_NAME="playwright-mcp-http-server"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build and push Docker image
docker build -t $IMAGE_NAME .
docker push $IMAGE_NAME

# Deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --port 8931 \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --max-instances 10 \
    --set-env-vars "PLAYWRIGHT_HEADLESS=true,LOG_LEVEL=info"
```

## Configuration Options

### Resource Allocation

Adjust resources based on your needs:

```bash
gcloud run deploy $SERVICE_NAME \
    --memory 4Gi \        # Increase memory for heavy workloads
    --cpu 4 \             # Increase CPU cores
    --timeout 600 \       # Increase timeout for long operations
    --max-instances 20    # Increase max concurrent instances
```

### Environment Variables

Set custom environment variables:

```bash
gcloud run deploy $SERVICE_NAME \
    --set-env-vars "PLAYWRIGHT_BROWSER=chromium,PLAYWRIGHT_HEADLESS=true,LOG_LEVEL=info,MAX_SESSIONS=10"
```

Available environment variables:
- `PORT` - Server port (Cloud Run sets this automatically, defaults to 8931)
- `PLAYWRIGHT_BROWSER` - Browser type (chromium, firefox, webkit)
- `PLAYWRIGHT_HEADLESS` - Run headless (true/false)
- `LOG_LEVEL` - Logging level (error, warn, info, debug)
- `MAX_SESSIONS` - Maximum concurrent sessions
- `SESSION_TIMEOUT` - Session timeout in seconds
- `CORS_ORIGIN` - CORS allowed origins

### Authentication

By default, the service is deployed with `--allow-unauthenticated`. To require authentication:

```bash
gcloud run deploy $SERVICE_NAME \
    --no-allow-unauthenticated
```

Then access it using an identity token:

```bash
# Get identity token
TOKEN=$(gcloud auth print-identity-token)

# Make authenticated request
curl -H "Authorization: Bearer $TOKEN" \
     https://your-service-url/health
```

## Using Cloud Build (CI/CD)

For automated deployments, use Cloud Build:

1. **Push your code to a Git repository** (GitHub, GitLab, etc.)

2. **Create a Cloud Build trigger**:

```bash
gcloud builds triggers create github \
    --repo-name="your-repo" \
    --repo-owner="your-username" \
    --branch-pattern="^main$" \
    --build-config="cloudbuild.yaml"
```

Or use the `cloudbuild.yaml` file included in this repository.

3. **Manual build**:

```bash
gcloud builds submit --config cloudbuild.yaml
```

## Viewing Logs

```bash
# Stream logs
gcloud run services logs read $SERVICE_NAME --region $REGION --follow

# View recent logs
gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50
```

## Updating the Service

```bash
# Rebuild and redeploy
docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME .
docker push gcr.io/$PROJECT_ID/$SERVICE_NAME
gcloud run deploy $SERVICE_NAME --image gcr.io/$PROJECT_ID/$SERVICE_NAME --region $REGION
```

## Cost Optimization

Cloud Run charges based on:
- **Request count**: Pay per request
- **CPU and memory**: Pay for allocated resources per request
- **Instance hours**: Pay when instances are running

Tips:
- Use appropriate memory/CPU settings (start with 2Gi/2CPU)
- Set `--max-instances` to limit scaling costs
- Use `--min-instances 0` to scale to zero when idle (default)
- Consider `--min-instances 1` if you need instant startup

## Troubleshooting

### Build Fails

```bash
# Check build logs
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```

### Service Won't Start

```bash
# Check service logs
gcloud run services logs read $SERVICE_NAME --region $REGION

# Check service details
gcloud run services describe $SERVICE_NAME --region $REGION
```

### High Memory Usage

Increase memory allocation:

```bash
gcloud run deploy $SERVICE_NAME \
    --memory 4Gi \
    --region $REGION
```

### Timeout Issues

Increase timeout for long-running operations:

```bash
gcloud run deploy $SERVICE_NAME \
    --timeout 600 \
    --region $REGION
```

## Custom Domain

To use a custom domain:

```bash
# Map domain
gcloud run domain-mappings create \
    --service $SERVICE_NAME \
    --domain your-domain.com \
    --region $REGION
```

## Monitoring

View metrics in the [Cloud Run Console](https://console.cloud.google.com/run):

- Request count
- Latency
- Error rate
- Memory/CPU usage
- Instance count

## Security Best Practices

1. **Use IAM roles**: Restrict access using IAM
2. **Enable VPC connector**: For private resources
3. **Use Secret Manager**: For sensitive environment variables
4. **Enable Cloud Armor**: For DDoS protection
5. **Regular updates**: Keep dependencies updated

```bash
# Use Secret Manager for sensitive data
gcloud run deploy $SERVICE_NAME \
    --update-secrets="API_KEY=api-key:latest"
```

## Cleanup

To delete the service:

```bash
gcloud run services delete $SERVICE_NAME --region $REGION
```

To delete the container image:

```bash
gcloud container images delete gcr.io/$PROJECT_ID/$SERVICE_NAME
```

## Support

For issues:
- Check [Cloud Run documentation](https://cloud.google.com/run/docs)
- Review service logs
- Check [GCP status page](https://status.cloud.google.com)


