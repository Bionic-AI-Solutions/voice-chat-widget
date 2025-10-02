# =============================================================================
# PRODUCTION DOCKERFILE
# =============================================================================
# Multi-stage production build for the Voice Chat Widget
# Optimized for performance and security

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY src/package*.json ./src/
COPY admin/package*.json ./admin/

# Install dependencies
RUN npm ci --only=production --silent && \
    cd server && npm ci --only=production --silent && \
    cd ../src && npm ci --only=production --silent && \
    cd ../admin && npm ci --only=production --silent

# Copy source code
COPY . .

# Build applications
RUN cd server && npm run build && \
    cd ../src && npm run build && \
    cd ../admin && npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 app && \
    adduser -D -s /bin/sh -u 1000 -G app app

# Set working directory
WORKDIR /app

# Copy built applications
COPY --from=builder --chown=app:app /app/server/dist ./server/dist
COPY --from=builder --chown=app:app /app/server/package*.json ./server/
COPY --from=builder --chown=app:app /app/server/node_modules ./server/node_modules

COPY --from=builder --chown=app:app /app/src/dist ./src/dist
COPY --from=builder --chown=app:app /app/src/package*.json ./src/

COPY --from=builder --chown=app:app /app/admin/.next ./admin/.next
COPY --from=builder --chown=app:app /app/admin/package*.json ./admin/
COPY --from=builder --chown=app:app /app/admin/node_modules ./admin/node_modules

# Copy configuration files
COPY --chown=app:app docker/production/nginx.conf /etc/nginx/nginx.conf
COPY --chown=app:app docker/production/start.sh /start.sh

# Create necessary directories
RUN mkdir -p /app/logs /app/tmp && \
    chown -R app:app /app

# Switch to non-root user
USER app

# Expose ports
EXPOSE 3001 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["/start.sh"]
