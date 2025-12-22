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

# Handle authentication
$AuthMode = if ($env:AUTH_MODE) { $env:AUTH_MODE } else { "public" }
$AuthToken = if ($env:AUTH_TOKEN) { $env:AUTH_TOKEN } else { "" }
$AuthSecretName = if ($env:AUTH_SECRET_NAME) { $env:AUTH_SECRET_NAME } else { "playwright-mcp-auth-token" }

$DeployArgs = @(
    "--image", $ImageName,
    "--region", $Region,
    "--platform", "managed",
    "--port", "8931",
    "--memory", "2Gi",
    "--cpu", "2",
    "--timeout", "300",
    "--max-instances", "10",
    "--set-env-vars", "PLAYWRIGHT_HEADLESS=true,LOG_LEVEL=info,PORT=8931"
)

if ($AuthMode -eq "public") {
    Write-Host "⚠️  Deploying with public access (no authentication)" -ForegroundColor Yellow
    $DeployArgs += "--allow-unauthenticated"
} elseif ($AuthMode -eq "token") {
    if ([string]::IsNullOrEmpty($AuthToken)) {
        Write-Host "❌ AUTH_TOKEN is required when AUTH_MODE=token" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Deploying with bearer token authentication" -ForegroundColor Green
    $DeployArgs += "--allow-unauthenticated"
    $DeployArgs += "--set-env-vars"
    $DeployArgs += "AUTH_TOKEN=$AuthToken"
} elseif ($AuthMode -eq "secret") {
    Write-Host "✓ Deploying with Secret Manager authentication" -ForegroundColor Green
    # Enable Secret Manager API
    gcloud services enable secretmanager.googleapis.com 2>$null
    
    # Check if secret exists
    $SecretExists = gcloud secrets describe $AuthSecretName --project=$ProjectId 2>$null
    if (-not $SecretExists) {
        Write-Host "📝 Creating secret: $AuthSecretName" -ForegroundColor Yellow
        if ([string]::IsNullOrEmpty($AuthToken)) {
            Write-Host "⚠️  Generating random token..." -ForegroundColor Yellow
            # Generate random token (PowerShell equivalent of openssl rand -hex 32)
            $Bytes = New-Object byte[] 32
            [System.Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
            $AuthToken = [System.BitConverter]::ToString($Bytes).Replace("-", "").ToLower()
        }
        $AuthToken | gcloud secrets create $AuthSecretName `
            --data-file=- `
            --replication-policy="automatic" `
            --project=$ProjectId
        Write-Host "✓ Secret created. Save this token: $AuthToken" -ForegroundColor Green
    } else {
        Write-Host "✓ Using existing secret: $AuthSecretName" -ForegroundColor Green
    }
    
    $DeployArgs += "--allow-unauthenticated"
    $DeployArgs += "--set-env-vars"
    $DeployArgs += "AUTH_SECRET_NAME=$AuthSecretName,GCP_PROJECT_ID=$ProjectId"
    
    # Grant Cloud Run service account access to the secret
    $ServiceAccount = "${ProjectId}@${ProjectId}.iam.gserviceaccount.com"
    gcloud secrets add-iam-policy-binding $AuthSecretName `
        --member="serviceAccount:$ServiceAccount" `
        --role="roles/secretmanager.secretAccessor" `
        --project=$ProjectId 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Note: You may need to grant secret access manually" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Invalid AUTH_MODE. Use: public, token, or secret" -ForegroundColor Red
    exit 1
}

# Deploy to Cloud Run
Write-Host "☁️  Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName $DeployArgs

# Get the service URL
$ServiceUrl = (gcloud run services describe $ServiceName --region $Region --format 'value(status.url)')

Write-Host "✅ Deployment successful!" -ForegroundColor Green
Write-Host "📍 Service URL: $ServiceUrl" -ForegroundColor Green
Write-Host "🏥 Health check: $ServiceUrl/health" -ForegroundColor Green
Write-Host "🔌 MCP endpoint: $ServiceUrl/mcp" -ForegroundColor Green

if ($AuthMode -ne "public") {
    if ($AuthMode -eq "token") {
        Write-Host "🔑 Auth Token: $AuthToken" -ForegroundColor Yellow
    } else {
        Write-Host "🔑 Auth Secret: $AuthSecretName" -ForegroundColor Yellow
        if (-not [string]::IsNullOrEmpty($AuthToken)) {
            Write-Host "🔑 Auth Token: $AuthToken" -ForegroundColor Yellow
        }
    }
    Write-Host "📝 Use this token in your MCP registry configuration" -ForegroundColor Yellow
}

