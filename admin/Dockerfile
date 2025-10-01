# Base stage
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    git \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development

# Install all dependencies (including dev)
RUN npm install --silent

# Copy source code
COPY . .

# Set permissions
RUN chown -R node:node /app
USER node

# Expose port
EXPOSE 3000

# Start the application in development mode
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build

# Install all dependencies
RUN npm install --silent

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production --silent

# Copy built application
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.js ./next.config.js

# Set permissions
RUN chown -R node:node /app
USER node

# Expose port
EXPOSE 3000

# Start the application in production mode
CMD ["npm", "start"]
