FROM node:18-alpine

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
COPY server/package*.json ./server/
COPY src/package*.json ./src/

# Install dependencies (including dev dependencies for testing)
RUN npm install --silent
RUN cd server && npm install --silent
RUN cd src && npm install --silent

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs server/logs

# Set permissions
RUN chown -R node:node /app
USER node

# Default command
CMD ["npm", "test"]