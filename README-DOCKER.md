# Docker Development Environment

This project uses a comprehensive Docker-based development environment that keeps your host system completely clean. All development tools, dependencies, and services run in containers.

## 🚀 Quick Start

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose
- At least 4GB RAM and 5GB free disk space

### Setup (One-time)

```powershell
# Windows PowerShell
.\scripts\setup-docker-env.ps1

# Linux/Mac
chmod +x scripts/docker-dev.sh
./scripts/docker-dev.sh install
```

### Daily Development

```powershell
# Start development environment
.\scripts\docker-dev.ps1 start

# Stop development environment
.\scripts\docker-dev.ps1 stop

# View logs
.\scripts\docker-dev.ps1 logs

# Run tests
.\scripts\docker-dev.ps1 test

# Enter development container
.\scripts\docker-dev.ps1 shell
```

## 🏗️ Architecture

### Development Environment

```
┌─────────────────────────────────────────────────────────────┐
│                    Host System (Clean)                     │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │   Your Code     │  │   Docker CLI    │                 │
│  │   (Editable)    │  │   (Control)     │                 │
│  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Docker Containers                           │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Widget    │  │   Server    │  │    Admin    │        │
│  │  (React)    │  │  (Node.js)  │  │  (Next.js)  │        │
│  │ Port: 3000  │  │ Port: 3001  │  │ Port: 3002  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    Redis    │  │    MinIO    │  │  Supabase   │        │
│  │ Port: 6379  │  │ Port: 9000  │  │ Port: 54321 │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Workers   │  │   Testing   │  │   Linting   │        │
│  │ (Background)│  │ (On-demand) │  │ (On-demand) │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
voice-chat-widget/
├── docker/                          # Docker configurations
│   ├── dev/                         # Development environment
│   │   └── Dockerfile               # Development container
│   └── production/                  # Production configurations
│       ├── Dockerfile               # Production container
│       ├── nginx.conf               # Nginx configuration
│       └── start.sh                 # Production startup script
├── scripts/                         # Development scripts
│   ├── docker-dev.ps1               # Windows development script
│   ├── docker-dev.sh                # Linux/Mac development script
│   └── setup-docker-env.ps1         # Environment setup script
├── docker-compose.dev.yml           # Development services
├── docker-compose.prod.yml          # Production services
└── README-DOCKER.md                 # This file
```

## 🛠️ Development Workflow

### 1. Code Editing
- Edit code directly on your host system
- Use your preferred IDE/editor (VS Code, WebStorm, etc.)
- No need to install Node.js, npm, or any dependencies on host

### 2. Building and Running
- All builds happen in Docker containers
- Hot reload is enabled for all services
- Changes are automatically reflected in running containers

### 3. Testing
- Run tests in isolated containers
- No test dependencies on host system
- Consistent test environment across all machines

### 4. Dependencies
- All npm packages are installed in containers
- Node modules are cached in Docker volumes
- No `node_modules` folders on host system

## 🐳 Available Services

### Development Services

| Service | Port | Description |
|---------|------|-------------|
| Widget | 3000 | React widget development server |
| Server | 3001 | Node.js API server |
| Admin | 3002 | Next.js admin dashboard |
| Redis | 6379 | Task queue and caching |
| MinIO | 9000 | Object storage (API) |
| MinIO Console | 9001 | Object storage (Web UI) |
| Supabase DB | 54322 | PostgreSQL database |
| Supabase Studio | 54323 | Database management UI |

### Production Services

| Service | Port | Description |
|---------|------|-------------|
| Widget | 80 | Production widget (Nginx) |
| Server | 3001 | Production API server |
| Prometheus | 9090 | Metrics collection |
| Grafana | 3000 | Monitoring dashboard |

## 📋 Available Commands

### Development Commands

```powershell
# Start all development services
.\scripts\docker-dev.ps1 start

# Stop all development services
.\scripts\docker-dev.ps1 stop

# Restart all development services
.\scripts\docker-dev.ps1 restart

# Show logs for all services
.\scripts\docker-dev.ps1 logs

# Show logs for specific service
.\scripts\docker-dev.ps1 logs server-dev

# Run tests
.\scripts\docker-dev.ps1 test

# Run linting
.\scripts\docker-dev.ps1 lint

# Run type checking
.\scripts\docker-dev.ps1 type-check

# Install dependencies
.\scripts\docker-dev.ps1 install

# Enter development container shell
.\scripts\docker-dev.ps1 shell

# Show service status
.\scripts\docker-dev.ps1 status

# Clean up Docker resources
.\scripts\docker-dev.ps1 cleanup
```

### Production Commands

```powershell
# Start production environment
docker-compose -f docker-compose.prod.yml up -d

# Stop production environment
docker-compose -f docker-compose.prod.yml down

# Start with monitoring
docker-compose -f docker-compose.prod.yml --profile monitoring up -d

# Start with backup
docker-compose -f docker-compose.prod.yml --profile backup up -d
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Application Configuration
NODE_ENV=development
APP_NAME=voice-chat-widget

# Supabase Configuration
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Speechmatics Configuration
SPEECHMATICS_API_KEY=your_speechmatics_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_key

# Redis Configuration
REDIS_URL=redis://localhost:6379

# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
```

### Docker Compose Profiles

- `default`: Basic development services
- `testing`: Include test runner
- `quality`: Include linting and type checking
- `monitoring`: Include Prometheus and Grafana
- `backup`: Include backup services

## 🚨 Troubleshooting

### Common Issues

1. **Port conflicts**
   ```powershell
   # Check what's using a port
   netstat -ano | findstr :3000
   
   # Stop conflicting services or change ports in docker-compose.dev.yml
   ```

2. **Docker not running**
   ```powershell
   # Start Docker Desktop
   # Or restart Docker service
   Restart-Service docker
   ```

3. **Out of disk space**
   ```powershell
   # Clean up Docker resources
   .\scripts\docker-dev.ps1 cleanup
   
   # Or manually clean up
   docker system prune -a
   ```

4. **Services not starting**
   ```powershell
   # Check service logs
   .\scripts\docker-dev.ps1 logs
   
   # Check service status
   .\scripts\docker-dev.ps1 status
   ```

### Reset Environment

```powershell
# Stop all services
.\scripts\docker-dev.ps1 stop

# Clean up everything
.\scripts\docker-dev.ps1 cleanup

# Rebuild and restart
.\scripts\setup-docker-env.ps1 -Force
```

## 📊 Monitoring

### Development Monitoring

- **Service Health**: `.\scripts\docker-dev.ps1 status`
- **Logs**: `.\scripts\docker-dev.ps1 logs`
- **Resource Usage**: Docker Desktop dashboard

### Production Monitoring

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **Service Health**: Docker Compose health checks

## 🔒 Security

### Development Security

- All services run in isolated containers
- No sensitive data stored on host
- Environment variables in `.env` files
- Non-root users in containers

### Production Security

- Multi-stage builds for minimal attack surface
- Non-root users in all containers
- Security headers in Nginx
- Rate limiting and request validation
- Secrets management via environment variables

## 📈 Performance

### Development Performance

- Volume mounting for fast file changes
- Node modules caching in Docker volumes
- Hot reload for all services
- Optimized Docker layers

### Production Performance

- Multi-stage builds for smaller images
- Nginx for static file serving
- Redis for caching
- Horizontal scaling with Docker Swarm/Kubernetes

## 🤝 Contributing

1. Use the Docker development environment
2. Run tests before committing: `.\scripts\docker-dev.ps1 test`
3. Run linting: `.\scripts\docker-dev.ps1 lint`
4. Ensure all services start successfully: `.\scripts\docker-dev.ps1 start`

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [React Docker Best Practices](https://create-react-app.dev/docs/deployment/#docker)
