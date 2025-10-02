#!/bin/sh

# =============================================================================
# PRODUCTION START SCRIPT
# =============================================================================
# This script starts all production services in the correct order

set -e

# Function to log messages
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Function to wait for a service to be ready
wait_for_service() {
    local host=$1
    local port=$2
    local service_name=$3
    local max_attempts=30
    local attempt=1

    log "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            log "$service_name is ready!"
            return 0
        fi
        
        log "Attempt $attempt/$max_attempts: $service_name not ready yet, waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log "ERROR: $service_name failed to start within expected time"
    return 1
}

# Start services in order
log "Starting Voice Chat Widget production services..."

# Start the API server
log "Starting API server..."
cd /app/server
node dist/index.js &
SERVER_PID=$!

# Wait for server to be ready
wait_for_service "localhost" "3001" "API Server"

# Start the admin dashboard (if needed)
if [ "$ENABLE_ADMIN" = "true" ]; then
    log "Starting admin dashboard..."
    cd /app/admin
    npm start &
    ADMIN_PID=$!
    
    # Wait for admin to be ready
    wait_for_service "localhost" "3000" "Admin Dashboard"
fi

# Start nginx for static file serving
log "Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Wait for nginx to be ready
wait_for_service "localhost" "80" "Nginx"

log "All services started successfully!"

# Function to handle shutdown
shutdown() {
    log "Shutting down services..."
    
    if [ -n "$ADMIN_PID" ]; then
        kill $ADMIN_PID 2>/dev/null || true
    fi
    
    kill $SERVER_PID 2>/dev/null || true
    kill $NGINX_PID 2>/dev/null || true
    
    log "Shutdown complete"
    exit 0
}

# Set up signal handlers
trap shutdown SIGTERM SIGINT

# Wait for any process to exit
wait
