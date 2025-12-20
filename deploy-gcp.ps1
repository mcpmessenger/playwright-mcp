# PowerShell deployment script for GCP Cloud Run

param(
    [string]$ProjectId = "",
    [string]$Region = "us-central1",
    [string]$ServiceName = "playwright-mcp-http-server"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying Playwright MCP HTTP Server to GCP Cloud Run" -ForegroundColor Green

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "❌ gcloud CLI is not installed. Please install it from https://cloud.google.com/sdk/docs/install" -ForegroundColor Red
    exit 1
}

# Check if PROJECT_ID is set
if ([string]::IsNullOrEmpty($ProjectId)) {
    $ProjectId = $env:GCP_PROJECT_ID
    if ([string]::IsNullOrEmpty($ProjectId)) {
        Write-Host "⚠️  GCP_PROJECT_ID not set. Attempting to use current gcloud project..." -ForegroundColor Yellow
        $ProjectId = (gcloud config get-value project 2>$null)
        if ([string]::IsNullOrEmpty($ProjectId)) {
            Write-Host "❌ No project ID found. Please set GCP_PROJECT_ID or run 'gcloud config set project YOUR_PROJECT_ID'" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "✓ Using project: $ProjectId" -ForegroundColor Green
}

# Set the project
gcloud config set project $ProjectId

# Enable required APIs
Write-Host "📦 Enabling required GCP APIs..." -ForegroundColor Yellow
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build and push the Docker image
$ImageName = "gcr.io/$ProjectId/$ServiceName"

Write-Host "🔨 Building Docker image..." -ForegroundColor Yellow
docker build -t $ImageName .

Write-Host "📤 Pushing image to Container Registry..." -ForegroundColor Yellow
docker push $ImageName

# Deploy to Cloud Run
Write-Host "☁️  Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image $ImageName `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --port 8931 `
    --memory 2Gi `
    --cpu 2 `
    --timeout 300 `
    --max-instances 10 `
    --set-env-vars "PLAYWRIGHT_HEADLESS=true,LOG_LEVEL=info" `
    --set-env-vars "PORT=8931"

# Get the service URL
$ServiceUrl = (gcloud run services describe $ServiceName --region $Region --format 'value(status.url)')

Write-Host "✅ Deployment successful!" -ForegroundColor Green
Write-Host "📍 Service URL: $ServiceUrl" -ForegroundColor Green
Write-Host "🏥 Health check: $ServiceUrl/health" -ForegroundColor Green
Write-Host "🔌 MCP endpoint: $ServiceUrl/mcp" -ForegroundColor Green

