# OpenAI Codex Environment Setup for WHK Recipe Configuration

This guide provides instructions for setting up the WHK Recipe Configuration mono repo in an OpenAI Codex environment.

## 🚀 Quick Start

For immediate development, run the quick start script:

```bash
chmod +x quick-start-codex.sh
./quick-start-codex.sh
```

This will automatically detect if full setup is needed and start all services.

## 📋 Full Setup

For a complete environment setup from scratch:

```bash
chmod +x setup-codex.sh
./setup-codex.sh
```

## 🏗️ Architecture Overview

This mono repo contains:

- **Backend API** (NestJS) - `apps/whk-recipe-configuration`
- **Frontend UI** (Next.js) - `apps/mes-ui`
- **Admin Panel** (React) - `apps/whk-recipe-configuration-admin`

### Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3001 | Next.js application |
| Backend API | 3000 | NestJS API server |
| Admin Panel | 3002 | React admin interface |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching and sessions |
| RabbitMQ | 5672/15672 | Message queue |
| MQTT Broker | 1883/9001 | IoT messaging |
| PgAdmin | 5050 | Database management |

## 🔧 Development Commands

### Starting Services

```bash
# Start all services
docker compose -f docker-compose.codex.yml up -d

# Start specific services
docker compose -f docker-compose.codex.yml up -d postgres redis
docker compose -f docker-compose.codex.yml up -d backend frontend admin

# View logs
docker compose -f docker-compose.codex.yml logs -f backend
docker compose -f docker-compose.codex.yml logs -f frontend
```

### Database Operations

```bash
cd apps/whk-recipe-configuration

# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# Run migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

### Application Development

```bash
# Backend development
cd apps/whk-recipe-configuration
npm run start:dev

# Frontend development
cd apps/mes-ui
npm run dev

# Admin panel development
cd apps/whk-recipe-configuration-admin
npm start
```

## 🐳 Docker Configuration

### Codex-Optimized Setup

The `docker-compose.codex.yml` file is specifically optimized for OpenAI Codex environments with:

- Health checks for all services
- Proper service dependencies
- Development-friendly volume mounts
- Debug ports exposed
- Optimized resource allocation

### Development Dockerfiles

Each application has a development Dockerfile:

- `apps/whk-recipe-configuration/Dockerfile.dev` - NestJS backend
- `apps/mes-ui/Dockerfile.dev` - Next.js frontend
- `apps/whk-recipe-configuration-admin/Dockerfile.dev` - React admin

## 🔐 Environment Configuration

### Required Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/whk_mes"
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=whk_mes

# Authentication
JWT_SECRET=your-jwt-secret-here
AZURE_CLIENT_ID=your-azure-client-id
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_TENANT_ID=your-azure-tenant-id

# API Keys
OPENAI_API_KEY=your-openai-api-key

# Environment
NODE_ENV=development
```

### Service URLs

In Codex environment, services communicate using these URLs:

- Backend API: `http://backend:3000` (internal) / `http://localhost:3000` (external)
- Database: `postgresql://postgres:password@postgres:5432/whk_mes`
- Redis: `redis://redis:6379`
- RabbitMQ: `amqp://admin:password@rabbitmq:5672`
- MQTT: `mqtt://mosquitto:1883`

## 🧪 Testing

### Running Tests

```bash
# Backend tests
cd apps/whk-recipe-configuration
npm run test
npm run test:e2e

# Frontend tests
cd apps/mes-ui
npm run test
npm run test:e2e

# Admin tests
cd apps/whk-recipe-configuration-admin
npm test
```

### Test Databases

The setup includes separate test database configurations for isolated testing.

## 📊 Monitoring and Debugging

### Service Health Checks

All services include health checks accessible at:

- Backend: `http://localhost:3000/api/_health/live`
- Frontend: `http://localhost:3001/api/_health/live`

### Debugging

Debug ports are exposed for development:

- Backend: Port 9229 (Node.js debugger)
- Frontend: Standard Next.js debugging

### Logs

View service logs:

```bash
# All services
docker compose -f docker-compose.codex.yml logs -f

# Specific service
docker compose -f docker-compose.codex.yml logs -f backend

# Follow logs with timestamps
docker compose -f docker-compose.codex.yml logs -f -t backend
```

## 🔄 Common Workflows

### Adding New Dependencies

```bash
# Backend
cd apps/whk-recipe-configuration
npm install package-name
docker compose -f docker-compose.codex.yml restart backend

# Frontend
cd apps/mes-ui
npm install package-name
docker compose -f docker-compose.codex.yml restart frontend
```

### Database Schema Changes

```bash
cd apps/whk-recipe-configuration

# 1. Modify schema.prisma
# 2. Generate migration
npx prisma migrate dev --name description-of-change

# 3. Apply to running database
npx prisma db push

# 4. Restart backend service
docker compose -f docker-compose.codex.yml restart backend
```

### Code Generation

```bash
# Generate Prisma client after schema changes
cd apps/whk-recipe-configuration
npx prisma generate

# Generate GraphQL types (if applicable)
npm run generate:types
```

## 🚨 Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000-3002, 5432, 6379, 5672, 1883, 5050 are available
2. **Database connection**: Wait for PostgreSQL to be fully ready (health check)
3. **Prisma client**: Regenerate after schema changes
4. **Docker permissions**: Ensure Docker daemon is running and accessible

### Reset Environment

```bash
# Stop all services
docker compose -f docker-compose.codex.yml down -v

# Remove setup marker
rm -f .setup-complete

# Run full setup again
./setup-codex.sh
```

### Service Status

```bash
# Check service status
docker compose -f docker-compose.codex.yml ps

# Check service health
docker compose -f docker-compose.codex.yml exec backend curl -f http://localhost:3000/api/_health/live
```

## 📚 Additional Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

## 🤝 Contributing

1. Make changes in your feature branch
2. Test locally using the Codex environment
3. Ensure all services start and tests pass
4. Submit pull request

## 📞 Support

For issues specific to the Codex environment setup, check:

1. Service logs: `docker compose -f docker-compose.codex.yml logs [service]`
2. Service health: `docker compose -f docker-compose.codex.yml ps`
3. Environment variables: Ensure `.env` file is properly configured
4. Port availability: Check for conflicts with other services 