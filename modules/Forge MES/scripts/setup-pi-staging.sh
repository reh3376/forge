#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

readonly PI_HOST="${PI_HOST:-pi@192.168.0.108}"
readonly REMOTE_DIR="${REMOTE_DIR:-~/whk-staging}"
readonly NODE_VERSION="18"

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Main setup function
main() {
    print_header "WhiskeyHouse MES - Raspberry Pi Staging Setup"

    # Step 1: Update Node.js
    print_header "Installing Node.js ${NODE_VERSION} LTS"
    print_info "Removing old Node.js..."
    ssh "$PI_HOST" "sudo apt-get remove -y nodejs npm 2>/dev/null || true"

    print_info "Installing Node.js ${NODE_VERSION}..."
    ssh "$PI_HOST" "curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -"
    ssh "$PI_HOST" "sudo apt-get install -y nodejs"

    NODE_VER=$(ssh "$PI_HOST" "node --version")
    print_success "Node.js installed: $NODE_VER"

    # Step 2: Install PM2
    print_header "Installing PM2"
    ssh "$PI_HOST" "sudo npm install -g pm2"
    print_success "PM2 installed"

    # Step 3: Install Docker
    print_header "Installing Docker"
    print_info "Checking if Docker is installed..."
    if ssh "$PI_HOST" "command -v docker >/dev/null 2>&1"; then
        print_success "Docker already installed"
    else
        print_info "Installing Docker..."
        ssh "$PI_HOST" "curl -fsSL https://get.docker.com -o get-docker.sh"
        ssh "$PI_HOST" "sudo sh get-docker.sh"
        ssh "$PI_HOST" "sudo usermod -aG docker pi"
        ssh "$PI_HOST" "rm get-docker.sh"
        print_success "Docker installed"
    fi

    # Step 4: Install Docker Compose
    print_header "Installing Docker Compose"
    print_info "Installing docker-compose plugin..."
    ssh "$PI_HOST" "sudo apt-get install -y docker-compose-plugin"
    print_success "Docker Compose installed"

    # Step 5: Create remote directory
    print_header "Creating Application Directory"
    ssh "$PI_HOST" "mkdir -p $REMOTE_DIR"
    print_success "Directory created at $REMOTE_DIR"

    # Step 6: Copy and start Docker Compose services
    print_header "Setting up Docker Services"
    print_info "Copying docker-compose.staging.yml..."
    scp docker-compose.staging.yml "$PI_HOST:$REMOTE_DIR/"
    scp .env.staging "$PI_HOST:$REMOTE_DIR/.env"

    print_info "Starting PostgreSQL, Redis, and RabbitMQ..."
    ssh "$PI_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.staging.yml up -d postgres redis rabbitmq"
    print_success "Docker services started"

    # Step 7: Install ngrok
    print_header "Installing ngrok"
    ssh "$PI_HOST" "curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null"
    ssh "$PI_HOST" "echo 'deb https://ngrok-agent.s3.amazonaws.com buster main' | sudo tee /etc/apt/sources.list.d/ngrok.list"
    ssh "$PI_HOST" "sudo apt-get update && sudo apt-get install -y ngrok"
    print_success "ngrok installed"

    # Step 9: Configure ngrok authtoken
    print_header "Configuring ngrok"
    print_info "Setting authtoken..."
    ssh "$PI_HOST" "ngrok config add-authtoken 2gylqYV8cosnj0IWt2P4tmnYlQO_4yzreDKHHggvpVTYiEPMj"
    print_success "ngrok configured"

    print_header "Setup Complete!"
    print_success "Raspberry Pi is ready for staging deployment"
    echo ""
    print_info "Docker Services Running:"
    print_info "  - PostgreSQL: localhost:5432"
    print_info "  - Redis: localhost:6379"
    print_info "  - RabbitMQ: localhost:5672"
    print_info "Directory: $REMOTE_DIR"
    echo ""
    print_info "Next step: Run ./scripts/deploy-pi-staging.sh to deploy the backend application"
}

main "$@"
