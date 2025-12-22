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

# Handle authentication
AUTH_MODE=${AUTH_MODE:-"public"}  # public, token, secret
AUTH_TOKEN=${AUTH_TOKEN:-""}
AUTH_SECRET_NAME=${AUTH_SECRET_NAME:-"playwright-mcp-auth-token"}

DEPLOY_ARGS=(
    --image "$IMAGE_NAME"
    --region "$REGION"
    --platform managed
    --port 8931
    --memory 2Gi
    --cpu 2
    --timeout 300
    --max-instances 10
    --set-env-vars "PLAYWRIGHT_HEADLESS=true,LOG_LEVEL=info,PORT=8931"
)

if [ "$AUTH_MODE" = "public" ]; then
    echo -e "${YELLOW}⚠️  Deploying with public access (no authentication)${NC}"
    DEPLOY_ARGS+=(--allow-unauthenticated)
elif [ "$AUTH_MODE" = "token" ]; then
    if [ -z "$AUTH_TOKEN" ]; then
        echo -e "${RED}❌ AUTH_TOKEN is required when AUTH_MODE=token${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Deploying with bearer token authentication${NC}"
    DEPLOY_ARGS+=(--allow-unauthenticated)  # Still allow unauthenticated, but app will check token
    DEPLOY_ARGS+=(--set-env-vars "AUTH_TOKEN=$AUTH_TOKEN")
elif [ "$AUTH_MODE" = "secret" ]; then
    echo -e "${GREEN}✓ Deploying with Secret Manager authentication${NC}"
    # Enable Secret Manager API
    gcloud services enable secretmanager.googleapis.com 2>/dev/null || true
    
    # Check if secret exists, create if not
    if ! gcloud secrets describe "$AUTH_SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
        echo -e "${YELLOW}📝 Creating secret: $AUTH_SECRET_NAME${NC}"
        if [ -z "$AUTH_TOKEN" ]; then
            echo -e "${YELLOW}⚠️  Generating random token...${NC}"
            AUTH_TOKEN=$(openssl rand -hex 32)
        fi
        echo -n "$AUTH_TOKEN" | gcloud secrets create "$AUTH_SECRET_NAME" \
            --data-file=- \
            --replication-policy="automatic" \
            --project="$PROJECT_ID"
        echo -e "${GREEN}✓ Secret created. Save this token: ${AUTH_TOKEN}${NC}"
    else
        echo -e "${GREEN}✓ Using existing secret: $AUTH_SECRET_NAME${NC}"
    fi
    
    DEPLOY_ARGS+=(--allow-unauthenticated)  # Still allow unauthenticated, but app will check token
    DEPLOY_ARGS+=(--set-env-vars "AUTH_SECRET_NAME=$AUTH_SECRET_NAME,GCP_PROJECT_ID=$PROJECT_ID")
    
    # Grant Cloud Run service account access to the secret
    SERVICE_ACCOUNT=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || echo "")
    if [ -z "$SERVICE_ACCOUNT" ]; then
        SERVICE_ACCOUNT="${PROJECT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
    fi
    gcloud secrets add-iam-policy-binding "$AUTH_SECRET_NAME" \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor" \
        --project="$PROJECT_ID" 2>/dev/null || echo -e "${YELLOW}⚠️  Note: You may need to grant secret access manually${NC}"
else
    echo -e "${RED}❌ Invalid AUTH_MODE. Use: public, token, or secret${NC}"
    exit 1
fi

# Deploy to Cloud Run
echo -e "${YELLOW}☁️  Deploying to Cloud Run...${NC}"
gcloud run deploy "$SERVICE_NAME" "${DEPLOY_ARGS[@]}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)')

echo -e "${GREEN}✅ Deployment successful!${NC}"
echo -e "${GREEN}📍 Service URL: ${SERVICE_URL}${NC}"
echo -e "${GREEN}🏥 Health check: ${SERVICE_URL}/health${NC}"
echo -e "${GREEN}🔌 MCP endpoint: ${SERVICE_URL}/mcp${NC}"

if [ "$AUTH_MODE" != "public" ]; then
    if [ "$AUTH_MODE" = "token" ]; then
        echo -e "${YELLOW}🔑 Auth Token: ${AUTH_TOKEN}${NC}"
    else
        echo -e "${YELLOW}🔑 Auth Secret: ${AUTH_SECRET_NAME}${NC}"
        if [ -n "$AUTH_TOKEN" ]; then
            echo -e "${YELLOW}🔑 Auth Token: ${AUTH_TOKEN}${NC}"
        fi
    fi
    echo -e "${YELLOW}📝 Use this token in your MCP registry configuration${NC}"
fi


