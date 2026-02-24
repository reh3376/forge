#!/bin/bash
set -e

# Print help message
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
  echo "Docker build helper for MES UI"
  echo ""
  echo "Usage: ./scripts/docker-build.sh [COMMAND]"
  echo ""
  echo "Commands:"
  echo "  build       Build the Docker image"
  echo "  run         Run the Docker container"
  echo "  stop        Stop the Docker container"
  echo "  compose     Build and run using docker-compose"
  echo "  compose-down Stop and remove containers created by docker-compose"
  echo "  help        Show this help message"
  echo ""
  exit 0
fi

# Set variables
IMAGE_NAME="whk-mes-ui"
CONTAINER_NAME="whk-mes-ui"
PORT=${PORT:-4000}

# Main script
case "$1" in
  build)
    echo "Building Docker image: $IMAGE_NAME"
    docker build -t $IMAGE_NAME .
    ;;
  
  run)
    echo "Running Docker container: $CONTAINER_NAME on port $PORT"
    docker run -d --name $CONTAINER_NAME -p $PORT:4000 $IMAGE_NAME
    ;;
  
  stop)
    echo "Stopping Docker container: $CONTAINER_NAME"
    docker stop $CONTAINER_NAME || true
    docker rm $CONTAINER_NAME || true
    ;;
  
  compose)
    echo "Building and running with docker-compose"
    docker-compose up -d --build
    ;;
  
  compose-down)
    echo "Stopping and removing docker-compose containers"
    docker-compose down
    ;;
  
  *)
    echo "Building Docker image: $IMAGE_NAME"
    docker build -t $IMAGE_NAME .
    
    echo "Stopping existing container if it exists"
    docker stop $CONTAINER_NAME 2>/dev/null || true
    docker rm $CONTAINER_NAME 2>/dev/null || true
    
    echo "Running Docker container: $CONTAINER_NAME on port $PORT"
    docker run -d --name $CONTAINER_NAME -p $PORT:4000 $IMAGE_NAME
    
    echo "Container is now running at http://localhost:$PORT"
    ;;
esac 