#!/bin/bash
# Deployment script for GCP Cloud Run

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-""}
REGION=${GCP_REGION:-"us-central1"}
SERVICE_NAME="playwright-mcp-http-server"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying Playwright MCP HTTP Server to GCP Cloud Run${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed. Please install it from https://cloud.google.com/sdk/docs/install${NC}"
    exit 1
fi

# Check if PROJECT_ID is set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  GCP_PROJECT_ID not set. Attempting to use current gcloud project...${NC}"
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
    if [ -z "$PROJECT_ID" ]; then
        echo -e "${RED}❌ No project ID found. Please set GCP_PROJECT_ID or run 'gcloud config set project YOUR_PROJECT_ID'${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Using project: ${PROJECT_ID}${NC}"
fi

# Set the project
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo -e "${YELLOW}📦 Enabling required GCP APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build and push the Docker image
echo -e "${YELLOW}🔨 Building Docker image...${NC}"
docker build -t "$IMAGE_NAME" .

echo -e "${YELLOW}📤 Pushing image to Container Registry...${NC}"
docker push "$IMAGE_NAME"

# Deploy to Cloud Run
echo -e "${YELLOW}☁️  Deploying to Cloud Run...${NC}"
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_NAME" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --port 8931 \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --max-instances 10 \
    --set-env-vars "PLAYWRIGHT_HEADLESS=true,LOG_LEVEL=info" \
    --set-env-vars "PORT=8931"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)')

echo -e "${GREEN}✅ Deployment successful!${NC}"
echo -e "${GREEN}📍 Service URL: ${SERVICE_URL}${NC}"
echo -e "${GREEN}🏥 Health check: ${SERVICE_URL}/health${NC}"
echo -e "${GREEN}🔌 MCP endpoint: ${SERVICE_URL}/mcp${NC}"

