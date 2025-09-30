# Docker Setup Guide

This guide explains how to set up and run the Voice Chat Widget using Docker.

## Prerequisites

- Docker Desktop (version 20.10 or higher)
- Docker Compose (version 2.0 or higher)
- At least 4GB of available RAM
- Ports 3000, 3001, 3002, 3003, 6379, 9000, 9001 available

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Bionic-AI-Solutions/voice-chat-widget.git
cd voice-chat-widget
```

### 2. Environment Setup

```bash
# Copy the environment template
cp env.example .env

# Edit the environment file with your configuration
nano .env
```

### 3. Start Development Environment

```bash
# Start all services in development mode
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Access the Application

- **Widget**: http://localhost:3000
- **Server**: http://localhost:3001
- **Admin Dashboard**: http://localhost:3002
- **MinIO Console**: http://localhost:9001
- **Redis**: localhost:6379

## Service Architecture

### Development Services

- **widget-dev**: React development server with hot reload
- **server-dev**: Express.js backend with auto-restart
- **redis**: Redis for caching and session storage
- **minio**: S3-compatible object storage for audio files

### Production Services

- **widget-prod**: Optimized React build served by Nginx
- **server-prod**: Production Express.js server
- **redis**: Redis for caching and session storage
- **minio**: S3-compatible object storage for audio files

## Docker Commands

### Development

```bash
# Start development environment
docker-compose up -d

# Start specific services
docker-compose up -d widget-dev server-dev

# View logs
docker-compose logs -f widget-dev

# Stop all services
docker-compose down
```

### Production

```bash
# Start production environment
docker-compose --profile production up -d

# Scale services
docker-compose --profile production up -d --scale server-prod=3

# Stop production services
docker-compose --profile production down
```

### Testing

```bash
# Run unit tests
docker-compose --profile test up test

# Run tests with coverage
docker-compose --profile test up test-coverage

# Run linting
docker-compose --profile lint up lint

# Run type checking
docker-compose --profile type-check up type-check
```

## Environment Variables

### Required Variables

```bash
# Speechmatics API
SPEECHMATICS_API_KEY=your_speechmatics_api_key

# OpenAI API (optional)
OPENAI_API_KEY=your_openai_api_key

# Server Configuration
APP_PORT=3001
APP_HOST=0.0.0.0
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### Optional Variables

```bash
# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Redis Configuration
REDIS_URL=redis://redis:6379

# MinIO Configuration
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
```

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Check what's using the port
docker-compose ps

# Stop conflicting services
docker-compose down

# Or change ports in docker-compose.yml
```

#### Permission Issues

```bash
# Fix file permissions
sudo chown -R $USER:$USER .

# Rebuild containers
docker-compose build --no-cache
```

#### Memory Issues

```bash
# Check Docker memory allocation
docker system df

# Clean up unused resources
docker system prune -a
```

### Health Checks

```bash
# Check service health
docker-compose ps

# Check specific service logs
docker-compose logs server-dev

# Check service health endpoints
curl http://localhost:3001/health
```

## Development Workflow

### 1. Code Changes

- Edit files in your local directory
- Changes are automatically reflected in development containers
- Use `docker-compose logs -f` to monitor changes

### 2. Testing

```bash
# Run tests in container
docker-compose --profile test up test

# Run specific test file
docker-compose exec test npm test -- tests/unit/VoiceService.test.ts
```

### 3. Building

```bash
# Build production images
docker-compose build

# Build specific service
docker-compose build widget-prod
```

## Production Deployment

### 1. Environment Setup

```bash
# Set production environment variables
cp env.example .env.production

# Update configuration for production
nano .env.production
```

### 2. Build and Deploy

```bash
# Build production images
docker-compose --profile production build

# Start production services
docker-compose --profile production up -d
```

### 3. Monitoring

```bash
# Monitor logs
docker-compose --profile production logs -f

# Check resource usage
docker stats

# Scale services
docker-compose --profile production up -d --scale server-prod=3
```

## Security Considerations

### 1. Environment Variables

- Never commit `.env` files to version control
- Use Docker secrets for sensitive data in production
- Rotate API keys regularly

### 2. Network Security

- Use Docker networks for service communication
- Expose only necessary ports
- Use HTTPS in production

### 3. Container Security

- Use non-root users in containers
- Keep base images updated
- Scan images for vulnerabilities

## Performance Optimization

### 1. Resource Limits

```yaml
# Add to docker-compose.yml
services:
  server-prod:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

### 2. Caching

- Use Docker layer caching
- Cache npm dependencies
- Use multi-stage builds

### 3. Monitoring

```bash
# Monitor resource usage
docker stats

# Check container health
docker-compose ps
```

## Backup and Recovery

### 1. Data Backup

```bash
# Backup Redis data
docker-compose exec redis redis-cli BGSAVE

# Backup MinIO data
docker-compose exec minio mc mirror /data /backup
```

### 2. Configuration Backup

```bash
# Backup environment files
cp .env .env.backup

# Backup docker-compose configuration
cp docker-compose.yml docker-compose.yml.backup
```

## Support

For issues and questions:

- Check the logs: `docker-compose logs -f`
- Review this documentation
- Create an issue on GitHub
- Contact the development team
