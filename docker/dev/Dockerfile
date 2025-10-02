# =============================================================================
# DEVELOPMENT DOCKERFILE
# =============================================================================
# Multi-stage Dockerfile for development environment
# Keeps host environment clean by containerizing all development tools

# Base stage with common dependencies
FROM node:18-alpine AS base

# Set working directory
WORKDIR /workspace

# Install system dependencies
RUN apk add --no-cache \
    curl \
    wget \
    git \
    python3 \
    make \
    g++ \
    bash \
    jq \
    && rm -rf /var/cache/apk/*

# Install global npm packages for development (compatible with Node 18)
RUN npm install -g \
    typescript@^5.0.0 \
    ts-node@^10.0.0 \
    nodemon@^3.0.0 \
    concurrently@^8.0.0 \
    jest@^29.0.0 \
    eslint@^8.0.0 \
    prettier@^3.0.0 \
    @typescript-eslint/parser@^6.0.0 \
    @typescript-eslint/eslint-plugin@^6.0.0

# Development stage
FROM base AS development

# Install additional development tools
RUN apk add --no-cache \
    vim \
    nano \
    htop \
    && rm -rf /var/cache/apk/*

# Create non-root user for development
RUN addgroup -g 1001 developer && \
    adduser -D -s /bin/bash -u 1001 -G developer developer

# Set up development environment
RUN mkdir -p /workspace && \
    chown -R developer:developer /workspace

# Switch to non-root user
USER developer

# Set up bash profile for development
RUN echo 'export PS1="\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ "' >> ~/.bashrc && \
    echo 'alias ll="ls -la"' >> ~/.bashrc && \
    echo 'alias la="ls -A"' >> ~/.bashrc && \
    echo 'alias l="ls -CF"' >> ~/.bashrc

# Expose common development ports
EXPOSE 3000 3001 3002 54321 54322 54323 6379 9000 9001

# Default command (keeps container running)
CMD ["tail", "-f", "/dev/null"]

# Testing stage
FROM development AS testing

# Install additional testing tools (compatible with Node 18)
RUN npm install -g \
    supertest@^6.0.0 \
    @testing-library/react@^13.0.0 \
    @testing-library/jest-dom@^5.0.0 \
    @testing-library/user-event@^14.0.0 \
    playwright@^1.40.0

# Install Playwright browsers
RUN npx playwright install --with-deps

# Set up test environment
ENV NODE_ENV=test
ENV CI=true

# Production build stage
FROM base AS production

# Install production dependencies only (compatible with Node 18)
RUN npm install -g \
    pm2@^5.0.0

# Create production user
RUN addgroup -g 2000 app && \
    adduser -D -s /bin/sh -u 2000 -G app app

# Set up production environment
RUN mkdir -p /app && \
    chown -R app:app /app

USER app
WORKDIR /app

# Expose production port
EXPOSE 3001

# Default production command
CMD ["node", "dist/index.js"]
