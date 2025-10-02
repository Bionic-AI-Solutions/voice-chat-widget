# =============================================================================
# DOCKER ENVIRONMENT SETUP SCRIPT
# =============================================================================
# This script sets up a complete Docker-based development environment
# that keeps your host system completely clean

param(
    [switch]$SkipPrerequisites,
    [switch]$SkipEnvSetup,
    [switch]$Force
)

# Colors for output
$ErrorColor = "Red"
$SuccessColor = "Green"
$WarningColor = "Yellow"
$InfoColor = "Cyan"

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $InfoColor
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $SuccessColor
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $WarningColor
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $ErrorColor
}

# Function to check prerequisites
function Test-Prerequisites {
    Write-Status "Checking prerequisites..."
    
    # Check Docker
    try {
        $dockerVersion = docker --version
        Write-Success "Docker found: $dockerVersion"
    }
    catch {
        Write-Error "Docker is not installed or not running. Please install Docker Desktop and start it."
        return $false
    }
    
    # Check Docker Compose
    try {
        $composeVersion = docker-compose --version
        Write-Success "Docker Compose found: $composeVersion"
    }
    catch {
        try {
            $composeVersion = docker compose version
            Write-Success "Docker Compose found: $composeVersion"
        }
        catch {
            Write-Error "Docker Compose is not available. Please install Docker Compose."
            return $false
        }
    }
    
    # Check available disk space (at least 5GB)
    $drive = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
    $freeSpaceGB = [math]::Round($drive.FreeSpace / 1GB, 2)
    if ($freeSpaceGB -lt 5) {
        Write-Warning "Low disk space: $freeSpaceGB GB available. At least 5GB is recommended."
    } else {
        Write-Success "Disk space check passed: $freeSpaceGB GB available"
    }
    
    # Check available memory (at least 4GB)
    $memory = Get-WmiObject -Class Win32_ComputerSystem
    $totalMemoryGB = [math]::Round($memory.TotalPhysicalMemory / 1GB, 2)
    if ($totalMemoryGB -lt 4) {
        Write-Warning "Low memory: $totalMemoryGB GB available. At least 4GB is recommended."
    } else {
        Write-Success "Memory check passed: $totalMemoryGB GB available"
    }
    
    return $true
}

# Function to setup environment files
function Initialize-Environment {
    Write-Status "Setting up environment files..."
    
    # Create .env file if it doesn't exist
    if (-not (Test-Path ".env") -or $Force) {
        if (Test-Path "env.example") {
            Copy-Item "env.example" ".env"
            Write-Success ".env file created from template"
        } else {
            Write-Warning "env.example not found. Creating basic .env file..."
            @"
# Voice Chat Widget Environment Configuration
NODE_ENV=development
APP_NAME=voice-chat-widget
APP_VERSION=1.0.0

# Supabase Configuration
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydXRndG9zZXpnZm5sbmF6Z3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTY2NjgsImV4cCI6MjA3NDUzMjY2OH0.cFV-eVLR47SmLCl60tMrMPEcRb3apv7FswkpOcjOYv8
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydXRndG9zZXpnZm5sbmF6Z3FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODk1NjY2OCwiZXhwIjoyMDc0NTMyNjY4fQ.zIwbFgbqgqAiyGqgbnzX-wTVhjLfF5dNT5pbjdrIWCY

# Speechmatics Configuration
SPEECHMATICS_API_KEY=uT6VnTyO2seykGvFDyNP2R986gylZSOT

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Redis Configuration
REDIS_URL=redis://localhost:6379

# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_USE_SSL=false
"@ | Out-File -FilePath ".env" -Encoding UTF8
            Write-Success "Basic .env file created"
        }
    } else {
        Write-Success ".env file already exists"
    }
    
    # Create .env.local for local overrides
    if (-not (Test-Path ".env.local")) {
        @"
# Local environment overrides
# This file is ignored by git and can be used for local-specific settings

# Override any settings here for your local development
# Example:
# SUPABASE_URL=http://localhost:54321
# LOG_LEVEL=debug
"@ | Out-File -FilePath ".env.local" -Encoding UTF8
        Write-Success ".env.local file created"
    }
}

# Function to create Docker networks and volumes
function Initialize-DockerResources {
    Write-Status "Initializing Docker resources..."
    
    # Create development network
    try {
        docker network create voice-chat-dev-network 2>$null
        Write-Success "Development network created"
    }
    catch {
        Write-Warning "Development network may already exist"
    }
    
    # Create production network
    try {
        docker network create voice-chat-prod-network 2>$null
        Write-Success "Production network created"
    }
    catch {
        Write-Warning "Production network may already exist"
    }
    
    Write-Success "Docker resources initialized"
}

# Function to build development images
function Build-DevelopmentImages {
    Write-Status "Building development Docker images..."
    
    # Build development environment image
    Write-Status "Building development environment image..."
    docker build -f docker/dev/Dockerfile -t voice-chat-dev:latest .
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Development environment image built"
    } else {
        Write-Error "Failed to build development environment image"
        return $false
    }
    
    # Build server development image
    Write-Status "Building server development image..."
    docker build -f server/Dockerfile --target development -t voice-chat-server-dev:latest ./server
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Server development image built"
    } else {
        Write-Error "Failed to build server development image"
        return $false
    }
    
    # Build widget development image
    Write-Status "Building widget development image..."
    docker build -f src/Dockerfile --target development -t voice-chat-widget-dev:latest ./src
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Widget development image built"
    } else {
        Write-Error "Failed to build widget development image"
        return $false
    }
    
    # Build admin development image
    Write-Status "Building admin development image..."
    docker build -f admin/Dockerfile --target development -t voice-chat-admin-dev:latest ./admin
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Admin development image built"
    } else {
        Write-Error "Failed to build admin development image"
        return $false
    }
    
    return $true
}

# Function to start development environment
function Start-DevelopmentEnvironment {
    Write-Status "Starting development environment..."
    
    # Start infrastructure services first
    Write-Status "Starting infrastructure services..."
    docker-compose -f docker-compose.dev.yml up -d redis minio supabase-db
    
    # Wait for services to be healthy
    Write-Status "Waiting for services to be healthy..."
    Start-Sleep -Seconds 15
    
    # Start application services
    Write-Status "Starting application services..."
    docker-compose -f docker-compose.dev.yml up -d server-dev widget-dev admin-dev workers-dev
    
    Write-Success "Development environment started!"
    Write-Status "Services available at:"
    Write-Host "  - Widget: http://localhost:3000" -ForegroundColor $InfoColor
    Write-Host "  - Server: http://localhost:3001" -ForegroundColor $InfoColor
    Write-Host "  - Admin: http://localhost:3002" -ForegroundColor $InfoColor
    Write-Host "  - MinIO Console: http://localhost:9001" -ForegroundColor $InfoColor
    Write-Host "  - Supabase Studio: http://localhost:54323" -ForegroundColor $InfoColor
    Write-Host "  - Redis: localhost:6379" -ForegroundColor $InfoColor
}

# Function to show usage instructions
function Show-UsageInstructions {
    Write-Host "`n" -NoNewline
    Write-Host "=" * 60 -ForegroundColor $InfoColor
    Write-Host "DOCKER DEVELOPMENT ENVIRONMENT SETUP COMPLETE" -ForegroundColor $SuccessColor
    Write-Host "=" * 60 -ForegroundColor $InfoColor
    Write-Host ""
    Write-Host "Your host environment is now completely clean!" -ForegroundColor $SuccessColor
    Write-Host "All development tools and dependencies are containerized." -ForegroundColor $InfoColor
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor $InfoColor
    Write-Host "  .\scripts\docker-dev.ps1 start     - Start development environment" -ForegroundColor $InfoColor
    Write-Host "  .\scripts\docker-dev.ps1 stop      - Stop development environment" -ForegroundColor $InfoColor
    Write-Host "  .\scripts\docker-dev.ps1 logs      - Show logs" -ForegroundColor $InfoColor
    Write-Host "  .\scripts\docker-dev.ps1 test      - Run tests" -ForegroundColor $InfoColor
    Write-Host "  .\scripts\docker-dev.ps1 shell     - Enter development container" -ForegroundColor $InfoColor
    Write-Host "  .\scripts\docker-dev.ps1 status    - Show service status" -ForegroundColor $InfoColor
    Write-Host ""
    Write-Host "Development workflow:" -ForegroundColor $InfoColor
    Write-Host "  1. All code editing happens on your host (no containers needed)" -ForegroundColor $InfoColor
    Write-Host "  2. All builds, tests, and runs happen in Docker containers" -ForegroundColor $InfoColor
    Write-Host "  3. Hot reload is enabled for all services" -ForegroundColor $InfoColor
    Write-Host "  4. All dependencies are isolated in containers" -ForegroundColor $InfoColor
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor $InfoColor
    Write-Host "  1. Update .env file with your API keys" -ForegroundColor $InfoColor
    Write-Host "  2. Run: .\scripts\docker-dev.ps1 start" -ForegroundColor $InfoColor
    Write-Host "  3. Open http://localhost:3000 to see the widget" -ForegroundColor $InfoColor
    Write-Host ""
}

# Main execution
function Main {
    Write-Host "Docker Development Environment Setup" -ForegroundColor $SuccessColor
    Write-Host "=====================================" -ForegroundColor $SuccessColor
    Write-Host ""
    
    # Check prerequisites
    if (-not $SkipPrerequisites) {
        if (-not (Test-Prerequisites)) {
            Write-Error "Prerequisites check failed. Please fix the issues above and try again."
            exit 1
        }
    }
    
    # Setup environment
    if (-not $SkipEnvSetup) {
        Initialize-Environment
    }
    
    # Initialize Docker resources
    Initialize-DockerResources
    
    # Build development images
    if (-not (Build-DevelopmentImages)) {
        Write-Error "Failed to build development images. Please check the errors above."
        exit 1
    }
    
    # Start development environment
    Start-DevelopmentEnvironment
    
    # Show usage instructions
    Show-UsageInstructions
}

# Run main function
Main
