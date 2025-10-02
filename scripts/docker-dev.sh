#!/bin/bash

# =============================================================================
# DOCKER DEVELOPMENT SCRIPT
# =============================================================================
# This script provides a clean Docker-based development environment
# that keeps your host system completely unpolluted

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker Desktop and try again."
        exit 1
    fi
    print_success "Docker is running"
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available. Please install Docker Compose and try again."
        exit 1
    fi
    print_success "Docker Compose is available"
}

# Function to create .env file if it doesn't exist
setup_env() {
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        print_status "Creating .env file from template..."
        cp "$PROJECT_ROOT/env.example" "$PROJECT_ROOT/.env"
        print_success ".env file created. Please update it with your configuration."
    else
        print_success ".env file already exists"
    fi
}

# Function to start development environment
start_dev() {
    print_status "Starting development environment..."
    
    # Start infrastructure services first
    print_status "Starting infrastructure services (Redis, MinIO, Supabase)..."
    docker-compose -f docker-compose.dev.yml up -d redis minio supabase-db
    
    # Wait for services to be healthy
    print_status "Waiting for services to be healthy..."
    sleep 10
    
    # Start application services
    print_status "Starting application services..."
    docker-compose -f docker-compose.dev.yml up -d server-dev widget-dev admin-dev workers-dev
    
    print_success "Development environment started!"
    print_status "Services available at:"
    echo "  - Widget: http://localhost:3000"
    echo "  - Server: http://localhost:3001"
    echo "  - Admin: http://localhost:3002"
    echo "  - MinIO Console: http://localhost:9001"
    echo "  - Supabase Studio: http://localhost:54323"
    echo "  - Redis: localhost:6379"
}

# Function to stop development environment
stop_dev() {
    print_status "Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
    print_success "Development environment stopped"
}

# Function to restart development environment
restart_dev() {
    print_status "Restarting development environment..."
    stop_dev
    sleep 2
    start_dev
}

# Function to show logs
show_logs() {
    local service=${1:-""}
    if [ -n "$service" ]; then
        print_status "Showing logs for $service..."
        docker-compose -f docker-compose.dev.yml logs -f "$service"
    else
        print_status "Showing logs for all services..."
        docker-compose -f docker-compose.dev.yml logs -f
    fi
}

# Function to run tests
run_tests() {
    print_status "Running tests in Docker container..."
    docker-compose -f docker-compose.dev.yml --profile testing run --rm test-runner npm test
}

# Function to run linting
run_lint() {
    print_status "Running linting in Docker container..."
    docker-compose -f docker-compose.dev.yml --profile quality run --rm code-quality npm run lint
}

# Function to run type checking
run_type_check() {
    print_status "Running type checking in Docker container..."
    docker-compose -f docker-compose.dev.yml --profile quality run --rm code-quality npm run type-check
}

# Function to install dependencies
install_deps() {
    print_status "Installing dependencies in Docker containers..."
    
    # Install root dependencies
    docker-compose -f docker-compose.dev.yml run --rm dev-env npm install
    
    # Install server dependencies
    docker-compose -f docker-compose.dev.yml run --rm dev-env sh -c "cd server && npm install"
    
    # Install widget dependencies
    docker-compose -f docker-compose.dev.yml run --rm dev-env sh -c "cd src && npm install"
    
    # Install admin dependencies
    docker-compose -f docker-compose.dev.yml run --rm dev-env sh -c "cd admin && npm install"
    
    print_success "Dependencies installed"
}

# Function to clean up
cleanup() {
    print_status "Cleaning up Docker resources..."
    
    # Stop and remove containers
    docker-compose -f docker-compose.dev.yml down -v
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes (optional)
    read -p "Do you want to remove all volumes? This will delete all data. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume prune -f
        print_success "All volumes removed"
    fi
    
    print_success "Cleanup completed"
}

# Function to enter development container
enter_dev() {
    print_status "Entering development container..."
    docker-compose -f docker-compose.dev.yml exec dev-env bash
}

# Function to show status
show_status() {
    print_status "Development environment status:"
    docker-compose -f docker-compose.dev.yml ps
}

# Function to show help
show_help() {
    echo "Docker Development Script for Voice Chat Widget"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start       Start the development environment"
    echo "  stop        Stop the development environment"
    echo "  restart     Restart the development environment"
    echo "  logs        Show logs (optionally for specific service)"
    echo "  test        Run tests in Docker container"
    echo "  lint        Run linting in Docker container"
    echo "  type-check  Run type checking in Docker container"
    echo "  install     Install dependencies in Docker containers"
    echo "  shell       Enter development container shell"
    echo "  status      Show status of all services"
    echo "  cleanup     Clean up Docker resources"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start all services"
    echo "  $0 logs server-dev          # Show logs for server"
    echo "  $0 test                     # Run tests"
    echo "  $0 shell                    # Enter development container"
}

# Main script logic
main() {
    # Check prerequisites
    check_docker
    check_docker_compose
    
    # Setup environment
    setup_env
    
    # Parse command
    case "${1:-help}" in
        start)
            start_dev
            ;;
        stop)
            stop_dev
            ;;
        restart)
            restart_dev
            ;;
        logs)
            show_logs "$2"
            ;;
        test)
            run_tests
            ;;
        lint)
            run_lint
            ;;
        type-check)
            run_type_check
            ;;
        install)
            install_deps
            ;;
        shell)
            enter_dev
            ;;
        status)
            show_status
            ;;
        cleanup)
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
