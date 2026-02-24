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
readonly APP_DIR="apps/whk-recipe-configuration"

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

# Main deployment function
main() {
    print_header "WhiskeyHouse MES - Deploy to Raspberry Pi Staging"

    # Step 1: Build locally
    print_header "Building Application Locally"
    print_info "Installing dependencies..."
    cd "$APP_DIR"
    npm install

    print_info "Generating Prisma client..."
    npm run prisma:generate

    print_info "Building application..."
    npm run build

    print_success "Application built successfully"
    cd - > /dev/null

    # Step 2: Create deployment archive
    print_header "Creating Deployment Archive"
    print_info "Packaging application..."

    TEMP_DIR=$(mktemp -d)

    # Copy from the app directory
    tar -czf "$TEMP_DIR/whk-backend.tar.gz" \
        --exclude='.git' \
        -C "$APP_DIR" \
        package.json \
        prisma \
        dist \
        ngrok.yml \
        ecosystem.config.js

    # Also need to copy root node_modules (monorepo)
    tar -czf "$TEMP_DIR/node_modules.tar.gz" \
        -C "$(dirname $(dirname $APP_DIR))" \
        node_modules

    print_success "Archive created"

    # Step 3: Upload to Pi
    print_header "Uploading to Raspberry Pi"
    print_info "Copying backend files..."
    scp "$TEMP_DIR/whk-backend.tar.gz" "$PI_HOST:$REMOTE_DIR/"

    print_info "Copying node_modules..."
    scp "$TEMP_DIR/node_modules.tar.gz" "$PI_HOST:$REMOTE_DIR/"

    print_info "Extracting on Pi..."
    ssh "$PI_HOST" "cd $REMOTE_DIR && tar -xzf whk-backend.tar.gz && tar -xzf node_modules.tar.gz && rm whk-backend.tar.gz node_modules.tar.gz"

    print_success "Files uploaded"
    rm -rf "$TEMP_DIR"

    # Step 4: Copy environment and PM2 config
    print_header "Configuring Environment"

    # Create .env file
    ssh "$PI_HOST" "cat > $REMOTE_DIR/.env << 'EOF'
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://whk_user:whk_staging_pass@localhost:5432/whk_staging
DB_URL=postgresql://whk_user:whk_staging_pass@localhost:5432/whk_staging

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# CORS
CORS_ENABLED=true
CORS_ORIGINS=http://localhost:4000,https://staging.whiskeyhouse.ngrok.dev
CORS_CREDENTIALS=true

# JWT
APP_JWT_SECRET=staging_jwt_secret_change_in_production

# Server
BCRYPT_SALT=10
EOF"

    # Copy PM2 ecosystem config
    scp "$APP_DIR/ecosystem.config.js" "$PI_HOST:$REMOTE_DIR/"

    print_success "Environment configured"

    # Step 6: Run migrations
    print_header "Running Database Migrations"
    echo "Skipping migrations (run manually from local machine if needed)"
    # ssh "$PI_HOST" "cd $REMOTE_DIR && PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma migrate deploy"
    print_success "Migrations skipped"

    # Step 7: Start with PM2
    print_header "Starting Application with PM2"

    ssh "$PI_HOST" "cd $REMOTE_DIR && pm2 delete whk-backend-staging 2>/dev/null || true"
    ssh "$PI_HOST" "cd $REMOTE_DIR && pm2 start ecosystem.config.js --only whk-backend-staging"
    ssh "$PI_HOST" "pm2 save"
    ssh "$PI_HOST" "sudo env PATH=\$PATH:/usr/bin pm2 startup systemd -u pi --hp /home/pi"

    print_success "Application started"

    # Step 8: Start ngrok
    print_header "Starting ngrok Tunnel"

    ssh "$PI_HOST" "cd $REMOTE_DIR && pm2 delete ngrok-tunnel 2>/dev/null || true"
    ssh "$PI_HOST" "cd $REMOTE_DIR && pm2 start ecosystem.config.js --only ngrok-tunnel"
    ssh "$PI_HOST" "pm2 save"

    print_success "ngrok started"

    # Step 9: Show status
    print_header "Deployment Status"
    ssh "$PI_HOST" "pm2 list"

    echo ""
    print_success "Deployment Complete!"
    echo ""
    print_info "Backend URL: https://staging.whiskeyhouse.ngrok.dev"
    print_info "GraphQL Playground: https://staging.whiskeyhouse.ngrok.dev/graphql"
    echo ""
    print_info "Useful commands:"
    print_info "  ssh $PI_HOST 'pm2 logs whk-backend-staging'"
    print_info "  ssh $PI_HOST 'pm2 restart whk-backend-staging'"
    print_info "  ssh $PI_HOST 'pm2 monit'"
}

main "$@"
