#!/bin/bash

# =============================================================================
# OpenAI Codex Environment Setup Script for WHK Recipe Configuration Mono Repo
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running in Codex environment
check_codex_environment() {
    log_info "Checking OpenAI Codex environment..."
    if [[ -n "$CODEX_ENVIRONMENT" ]] || [[ -n "$OPENAI_CODEX" ]]; then
        log_success "Detected OpenAI Codex environment"
        export IS_CODEX=true
    else
        log_warning "Not detected as Codex environment, proceeding with standard setup"
        export IS_CODEX=false
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2)
    log_success "Node.js version: $node_version"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    local npm_version=$(npm --version)
    log_success "npm version: $npm_version"
    
    # Check Docker (optional)
    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version)
        log_success "Docker version: $docker_version"
        export HAS_DOCKER=true
    else
        log_warning "Docker not found. Some features may not be available."
        export HAS_DOCKER=false
    fi
    
    # Check Docker Compose (optional)
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        log_success "Docker Compose is available"
        export HAS_DOCKER_COMPOSE=true
    else
        log_warning "Docker Compose not found. Container orchestration will not be available."
        export HAS_DOCKER_COMPOSE=false
    fi
}

# Setup environment files
setup_environment() {
    log_info "Setting up environment files..."
    
    # Copy .env.example to .env if it doesn't exist
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            log_success "Created .env file from .env.example"
        else
            log_warning ".env.example not found, creating basic .env file"
            cat > .env << EOF
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/whk_mes"

# JWT
JWT_SECRET="your-jwt-secret-key-change-this-in-production"
JWT_EXPIRES_IN="24h"

# API
API_PORT=3000
API_HOST=localhost

# Frontend
NEXT_PUBLIC_API_URL="http://localhost:3000"
NEXT_PUBLIC_GRAPHQL_URL="http://localhost:3000/graphql"

# Admin
REACT_APP_API_URL="http://localhost:3000"
REACT_APP_GRAPHQL_URL="http://localhost:3000/graphql"

# Development
NODE_ENV=development
LOG_LEVEL=debug
EOF
        fi
    else
        log_success ".env file already exists"
    fi
}

# Install dependencies for all apps
install_dependencies() {
    log_info "Installing dependencies for all applications..."
    
    # Install root dependencies
    log_info "Installing root dependencies..."
    npm install
    
    # Install backend dependencies
    log_info "Installing backend dependencies..."
    cd apps/whk-recipe-configuration
    if [[ -f "package.json" ]]; then
        npm install
        log_success "Backend dependencies installed"
    else
        log_error "Backend package.json not found"
        exit 1
    fi
    cd ../..
    
    # Install frontend dependencies
    log_info "Installing frontend dependencies..."
    cd apps/mes-ui
    if [[ -f "package.json" ]]; then
        npm install
        log_success "Frontend dependencies installed"
    else
        log_error "Frontend package.json not found"
        exit 1
    fi
    cd ../..
    
    # Install admin dependencies
    log_info "Installing admin dependencies..."
    cd apps/whk-recipe-configuration-admin
    if [[ -f "package.json" ]]; then
        npm install
        log_success "Admin dependencies installed"
    else
        log_warning "Admin package.json not found, skipping admin dependencies"
    fi
    cd ../..
}

# Setup Prisma
setup_prisma() {
    log_info "Setting up Prisma..."
    
    cd apps/whk-recipe-configuration
    
    # Generate Prisma client
    if [[ -f "prisma/schema.prisma" ]]; then
        log_info "Generating Prisma client..."
        npx prisma generate
        log_success "Prisma client generated"
    else
        log_error "Prisma schema not found"
        exit 1
    fi
    
    cd ../..
}

# Setup Docker services
setup_docker() {
    if [[ "$HAS_DOCKER" == "true" && "$HAS_DOCKER_COMPOSE" == "true" ]]; then
        log_info "Setting up Docker services..."
        
        # Check if docker-compose.codex.yml exists
        if [[ -f "docker-compose.codex.yml" ]]; then
            log_info "Starting Docker services..."
            docker compose -f docker-compose.codex.yml up -d postgres redis
            
            # Wait for PostgreSQL to be ready
            log_info "Waiting for PostgreSQL to be ready..."
            sleep 10
            
            # Check if PostgreSQL is ready
            for i in {1..30}; do
                if docker compose -f docker-compose.codex.yml exec -T postgres pg_isready -U postgres; then
                    log_success "PostgreSQL is ready"
                    break
                fi
                if [[ $i -eq 30 ]]; then
                    log_error "PostgreSQL failed to start"
                    exit 1
                fi
                sleep 2
            done
            
            log_success "Docker services started"
        else
            log_warning "docker-compose.codex.yml not found, skipping Docker setup"
        fi
    else
        log_warning "Docker not available, skipping Docker setup"
    fi
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    cd apps/whk-recipe-configuration
    
    # Run database migrations
    if [[ "$HAS_DOCKER" == "true" ]]; then
        log_info "Running database migrations..."
        npx prisma db push
        log_success "Database migrations completed"
    else
        log_warning "Docker not available, skipping database setup"
        log_info "Please ensure PostgreSQL is running and run: npm run db:setup"
    fi
    
    cd ../..
}

# Build applications
build_applications() {
    log_info "Building applications..."
    
    # Build backend
    log_info "Building backend..."
    cd apps/whk-recipe-configuration
    npm run build
    log_success "Backend built successfully"
    cd ../..
    
    # Build frontend (optional for development)
    log_info "Building frontend..."
    cd apps/mes-ui
    npm run build
    log_success "Frontend built successfully"
    cd ../..
}

# Create startup scripts
create_startup_scripts() {
    log_info "Creating startup scripts..."
    
    # Create development startup script
    cat > scripts/start-dev.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting WHK Recipe Configuration Development Environment"

# Start Docker services if available
if command -v docker &> /dev/null && [[ -f "docker-compose.codex.yml" ]]; then
    echo "📦 Starting Docker services..."
    docker compose -f docker-compose.codex.yml up -d postgres redis
fi

# Start all applications concurrently
echo "🔧 Starting applications..."
npm run dev
EOF

    chmod +x scripts/start-dev.sh
    log_success "Created scripts/start-dev.sh"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    # Add any cleanup operations here
}

# Main setup function
main() {
    log_info "Starting OpenAI Codex environment setup for WHK Recipe Configuration..."
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    # Run setup steps
    check_codex_environment
    check_prerequisites
    setup_environment
    install_dependencies
    setup_prisma
    setup_docker
    setup_database
    build_applications
    create_startup_scripts
    
    # Final success message
    log_success "🎉 Setup completed successfully!"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Review and update .env file with your configuration"
    echo "2. Start development environment: ./scripts/start-dev.sh"
    echo "3. Or start individual services:"
    echo "   - Backend: npm run dev:backend"
    echo "   - Frontend: npm run dev:frontend"
    echo "   - Admin: npm run dev:admin"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "- npm run validate: Validate the setup"
    echo "- npm run docker:up: Start Docker services"
    echo "- npm run docker:logs: View Docker logs"
    echo ""
    
    # Create completion marker
    touch .setup-complete
}

# Run main function
main "$@" 