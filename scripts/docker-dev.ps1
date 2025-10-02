# =============================================================================
# DOCKER DEVELOPMENT SCRIPT (Windows PowerShell)
# =============================================================================
# This script provides a clean Docker-based development environment
# that keeps your host system completely unpolluted

param(
    [Parameter(Position=0)]
    [string]$Command = "help",
    
    [Parameter(Position=1)]
    [string]$Service = ""
)

# Script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Function to check if Docker is running
function Test-Docker {
    try {
        docker info | Out-Null
        Write-Success "Docker is running"
        return $true
    }
    catch {
        Write-Error "Docker is not running. Please start Docker Desktop and try again."
        return $false
    }
}

# Function to check if Docker Compose is available
function Test-DockerCompose {
    try {
        docker-compose --version | Out-Null
        Write-Success "Docker Compose is available"
        return $true
    }
    catch {
        try {
            docker compose version | Out-Null
            Write-Success "Docker Compose is available"
            return $true
        }
        catch {
            Write-Error "Docker Compose is not available. Please install Docker Compose and try again."
            return $false
        }
    }
}

# Function to create .env file if it doesn't exist
function Initialize-Environment {
    $envFile = Join-Path $ProjectRoot ".env"
    if (-not (Test-Path $envFile)) {
        Write-Status "Creating .env file from template..."
        $envExample = Join-Path $ProjectRoot "env.example"
        if (Test-Path $envExample) {
            Copy-Item $envExample $envFile
            Write-Success ".env file created. Please update it with your configuration."
        }
        else {
            Write-Warning "env.example file not found. Please create .env file manually."
        }
    }
    else {
        Write-Success ".env file already exists"
    }
}

# Function to start development environment
function Start-Development {
    Write-Status "Starting development environment..."
    
    # Start infrastructure services first
    Write-Status "Starting infrastructure services (Redis, MinIO, Supabase)..."
    docker-compose -f docker-compose.dev.yml up -d redis minio supabase-db
    
    # Wait for services to be healthy
    Write-Status "Waiting for services to be healthy..."
    Start-Sleep -Seconds 10
    
    # Start application services
    Write-Status "Starting application services..."
    docker-compose -f docker-compose.dev.yml up -d server-dev widget-dev admin-dev workers-dev
    
    Write-Success "Development environment started!"
    Write-Status "Services available at:"
    Write-Host "  - Widget: http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  - Server: http://localhost:3001" -ForegroundColor Cyan
    Write-Host "  - Admin: http://localhost:3002" -ForegroundColor Cyan
    Write-Host "  - MinIO Console: http://localhost:9001" -ForegroundColor Cyan
    Write-Host "  - Supabase Studio: http://localhost:54323" -ForegroundColor Cyan
    Write-Host "  - Redis: localhost:6379" -ForegroundColor Cyan
}

# Function to stop development environment
function Stop-Development {
    Write-Status "Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
    Write-Success "Development environment stopped"
}

# Function to restart development environment
function Restart-Development {
    Write-Status "Restarting development environment..."
    Stop-Development
    Start-Sleep -Seconds 2
    Start-Development
}

# Function to show logs
function Show-Logs {
    param([string]$ServiceName = "")
    if ($ServiceName) {
        Write-Status "Showing logs for $ServiceName..."
        docker-compose -f docker-compose.dev.yml logs -f $ServiceName
    }
    else {
        Write-Status "Showing logs for all services..."
        docker-compose -f docker-compose.dev.yml logs -f
    }
}

# Function to run tests
function Invoke-Tests {
    Write-Status "Running tests in Docker container..."
    docker-compose -f docker-compose.dev.yml --profile testing run --rm test-runner npm test
}

# Function to run linting
function Invoke-Lint {
    Write-Status "Running linting in Docker container..."
    docker-compose -f docker-compose.dev.yml --profile quality run --rm code-quality npm run lint
}

# Function to run type checking
function Invoke-TypeCheck {
    Write-Status "Running type checking in Docker container..."
    docker-compose -f docker-compose.dev.yml --profile quality run --rm code-quality npm run type-check
}

# Function to install dependencies
function Install-Dependencies {
    Write-Status "Installing dependencies in Docker containers..."
    
    # Install root dependencies
    docker-compose -f docker-compose.dev.yml run --rm dev-env npm install
    
    # Install server dependencies
    docker-compose -f docker-compose.dev.yml run --rm dev-env sh -c "cd server && npm install"
    
    # Install widget dependencies
    docker-compose -f docker-compose.dev.yml run --rm dev-env sh -c "cd src && npm install"
    
    # Install admin dependencies
    docker-compose -f docker-compose.dev.yml run --rm dev-env sh -c "cd admin && npm install"
    
    Write-Success "Dependencies installed"
}

# Function to clean up
function Remove-All {
    Write-Status "Cleaning up Docker resources..."
    
    # Stop and remove containers
    docker-compose -f docker-compose.dev.yml down -v
    
    # Remove unused images
    docker image prune -f
    
    # Ask about volumes
    $response = Read-Host "Do you want to remove all volumes? This will delete all data. (y/N)"
    if ($response -eq "y" -or $response -eq "Y") {
        docker volume prune -f
        Write-Success "All volumes removed"
    }
    
    Write-Success "Cleanup completed"
}

# Function to enter development container
function Enter-Development {
    Write-Status "Entering development container..."
    docker-compose -f docker-compose.dev.yml exec dev-env bash
}

# Function to show status
function Show-Status {
    Write-Status "Development environment status:"
    docker-compose -f docker-compose.dev.yml ps
}

# Function to show help
function Show-Help {
    Write-Host "Docker Development Script for Voice Chat Widget" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage: .\scripts\docker-dev.ps1 [COMMAND] [SERVICE]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  start       Start the development environment"
    Write-Host "  stop        Stop the development environment"
    Write-Host "  restart     Restart the development environment"
    Write-Host "  logs        Show logs (optionally for specific service)"
    Write-Host "  test        Run tests in Docker container"
    Write-Host "  lint        Run linting in Docker container"
    Write-Host "  type-check  Run type checking in Docker container"
    Write-Host "  install     Install dependencies in Docker containers"
    Write-Host "  shell       Enter development container shell"
    Write-Host "  status      Show status of all services"
    Write-Host "  cleanup     Clean up Docker resources"
    Write-Host "  help        Show this help message"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\scripts\docker-dev.ps1 start                    # Start all services"
    Write-Host "  .\scripts\docker-dev.ps1 logs server-dev          # Show logs for server"
    Write-Host "  .\scripts\docker-dev.ps1 test                     # Run tests"
    Write-Host "  .\scripts\docker-dev.ps1 shell                    # Enter development container"
}

# Main script logic
function Main {
    # Check prerequisites
    if (-not (Test-Docker)) { exit 1 }
    if (-not (Test-DockerCompose)) { exit 1 }
    
    # Setup environment
    Initialize-Environment
    
    # Parse command
    switch ($Command.ToLower()) {
        "start" {
            Start-Development
        }
        "stop" {
            Stop-Development
        }
        "restart" {
            Restart-Development
        }
        "logs" {
            Show-Logs $Service
        }
        "test" {
            Invoke-Tests
        }
        "lint" {
            Invoke-Lint
        }
        "type-check" {
            Invoke-TypeCheck
        }
        "install" {
            Install-Dependencies
        }
        "shell" {
            Enter-Development
        }
        "status" {
            Show-Status
        }
        "cleanup" {
            Remove-All
        }
        "help" {
            Show-Help
        }
        default {
            Write-Error "Unknown command: $Command"
            Show-Help
            exit 1
        }
    }
}

# Run main function
Main
