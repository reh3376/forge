# Docker Deployment for MES UI

This document provides instructions for building and deploying the MES UI application using Docker.

## Prerequisites

- Docker installed on your machine
- Docker Compose installed on your machine (optional, for using docker-compose.yml)

## Quick Start

The simplest way to build and run the application is using the provided script:

```bash
# Make the script executable (if not already)
chmod +x scripts/docker-build.sh

# Build and run in one step
./scripts/docker-build.sh
```

The application will be available at http://localhost:4000.

## Docker Compose

To use Docker Compose for running the application:

```bash
# Build and run with Docker Compose
./scripts/docker-build.sh compose

# Or directly with docker-compose
docker-compose up -d --build
```

To stop and remove the containers:

```bash
# Using the script
./scripts/docker-build.sh compose-down

# Or directly with docker-compose
docker-compose down
```

## Manual Commands

If you prefer to run Docker commands manually:

```bash
# Build the image
docker build -t whk-mes-ui .

# Run the container
docker run -d --name whk-mes-ui -p 4000:4000 whk-mes-ui

# Stop and remove the container
docker stop whk-mes-ui
docker rm whk-mes-ui
```

## Environment Variables

### Runtime Environment Variables

The Docker container uses the following environment variables at runtime:

- `PORT`: The port on which the application will run (default: 4000)
- `NODE_ENV`: The Node.js environment (default in container: production)
- `NEXT_PUBLIC_*`: Any public environment variables accessible to the client

You can set runtime environment variables in several ways:

1. In the `environment` section of `docker-compose.yml`
2. Using the `-e` flag with `docker run`:
   ```bash
   docker run -d -p 4000:4000 -e NEXT_PUBLIC_API_URL=http://api.example.com whk-mes-ui
   ```
3. Using an env file with Docker Compose (uncomment the `env_file` section in docker-compose.yml)

### Build-time Environment Variables

For Next.js applications, environment variables that start with `NEXT_PUBLIC_` need to be available at build time. These can be set using build arguments:

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://api.example.com \
  --build-arg NEXT_PUBLIC_AUTH_ENABLED=true \
  -t whk-mes-ui .
```

With Docker Compose, you can set build args in the `docker-compose.yml` file:

```yaml
services:
  mes-ui:
    build:
      context: .
      args:
        NEXT_PUBLIC_API_URL: http://api.example.com
```

### Connecting to Host Machine Services

When running in Docker, you'll need to use `host.docker.internal` to connect to services running on your host machine (instead of `localhost`). The default configuration in `docker-compose.yml` handles this automatically.

## Building for Different Environments

To build for different environments:

```bash
# Build with production settings
docker build -t whk-mes-ui:production .

# Run with production settings
docker run -d --name whk-mes-ui-prod -p 4000:4000 whk-mes-ui:production

# Or for a specific environment
docker build --build-arg NODE_ENV=staging -t whk-mes-ui:staging .
```

## Troubleshooting

### Container Fails to Start

Check the logs:

```bash
docker logs whk-mes-ui
```

### Port Conflict

If port 4000 is already in use, you can use a different port:

```bash
# Using the script
PORT=4001 ./scripts/docker-build.sh

# Or with docker run
docker run -d --name whk-mes-ui -p 4001:4000 whk-mes-ui
```

### Environment Variables Not Working

If environment variables aren't being applied:

1. Check if `NEXT_PUBLIC_*` variables are set at build time
2. Verify the values in the running container:
   ```bash
   docker exec whk-mes-ui env | grep NEXT_PUBLIC
   ```

### GraphQL Connection Issues

If you can't connect to the GraphQL backend:

1. Make sure you're using `host.docker.internal` instead of `localhost` in the container
2. Verify the backend service is running and accessible
3. Check for CORS issues - the backend must allow requests from the container

### Accessing the Container Shell

To access the shell inside the container:

```bash
docker exec -it whk-mes-ui /bin/sh
```

## Multi-stage Build Optimization

The Dockerfile uses a multi-stage build process to optimize the image size:

1. `deps` stage: Installs dependencies
2. `builder` stage: Builds the Next.js application
3. `runner` stage: Contains only the necessary files to run the application

This approach results in a smaller final image and better security by excluding development dependencies and build tools. 