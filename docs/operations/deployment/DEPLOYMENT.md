# Staging Deployment Guide

This guide explains how to deploy the WhiskeyHouse MES staging environment using Vercel (frontend) and either Railway (recommended) or ngrok (local backend) for the backend.

## Architecture

- **Frontend**: Deployed to Vercel with automatic deployments on push
- **Backend**: Railway deployment (production) or local with ngrok tunnel (development)
- **Infrastructure**: PostgreSQL, Redis, RabbitMQ (Railway managed or Docker locally)
- **CI/CD**: GitHub Actions for Vercel deployments

## Backend Options

### Option 1: Railway Backend (Recommended for Staging/Production)

Use Railway for a fully hosted backend that's always available:
- No need to run backend locally
- Persistent uptime
- Managed PostgreSQL, Redis
- Production-grade infrastructure

**Setup**:
1. Backend is already deployed at: `https://whk-mes-production.up.railway.app`
2. Frontend automatically uses Railway backend when deployed to Vercel
3. See "Railway Backend Configuration" section below for details

### Option 2: ngrok Backend (Local Development)

Use ngrok for local development with public access:
- Run backend on your machine
- Useful for active development
- Requires ngrok paid plan ($8/mo)
- See "ngrok Setup" section below for details

## Railway Backend Configuration

The Railway backend is pre-configured and always available. The frontend automatically connects when deployed to Vercel.

### Backend Configuration in Code

Available backend configurations are defined in `frontend/config/backend.ts`:

| Config Name | Description | When to Use |
|------------|-------------|-------------|
| `local_mes` | Local backend (localhost:3000) | Local development |
| `railway` | Railway production backend | Vercel staging/production |
| `nextjs` | Next.js API routes | Not currently used |
| `dev_mes` | Development server | Internal network |
| `prod_mes` | Production MES | Future production |
| `custom` | Custom URLs from env vars | Special cases |

### Vercel Environment Configuration

The frontend uses the `railway` configuration when deployed to Vercel. This is set via the environment variable:

```bash
NEXT_PUBLIC_BACKEND_CONFIG=railway
```

This is configured in `.env.vercel.preview` and tells the frontend to use:
- **API URL**: `https://whk-mes-production.up.railway.app/api`
- **GraphQL**: `https://whk-mes-production.up.railway.app/graphql`
- **WebSocket**: `https://whk-mes-production.up.railway.app`

**No additional environment variables are needed** - the Railway URLs are hard-coded in the `railway` configuration.

### Railway Service Information

- **URL**: https://whk-mes-production.up.railway.app
- **GraphQL Endpoint**: https://whk-mes-production.up.railway.app/graphql
- **Health Check**: https://whk-mes-production.up.railway.app/health
- **Database**: PostgreSQL (Railway managed)
- **Redis**: Railway managed
- **Deployment**: Automatic from main branch

### Testing Railway Connection

```bash
# Health check
curl https://whk-mes-production.up.railway.app/health

# GraphQL endpoint
curl -X POST https://whk-mes-production.up.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'
```

## ngrok Backend Setup (Local Development)

**Prerequisites:**

1. **ngrok Account** (Paid Plan - $8/mo)
   - Required for static domain (prevents URL changes on reconnect)
   - Sign up: https://ngrok.com/pricing
   - Get authtoken: https://dashboard.ngrok.com/get-started/your-authtoken

2. **Vercel Account** (Free Tier)
   - Sign up: https://vercel.com/signup
   - Connect to GitHub repository

3. **Local Requirements**
   - Docker and Docker Compose
   - Node.js 20+ and npm
   - PM2 (installed automatically by script)

## ngrok Initial Setup

### 1. Configure ngrok

```bash
# Install ngrok (macOS)
brew install ngrok

# Or download from https://ngrok.com/download

# Add your authtoken
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE

# Get a static domain from https://dashboard.ngrok.com/cloud-edge/domains
# Update backend/ngrok.yml with your domain
```

Edit `backend/ngrok.yml`:
```yaml
tunnels:
  whk-backend-staging:
    domain: your-static-domain.ngrok-free.app  # Your ngrok domain here
    addr: 3000
    proto: http
```

### 2. Configure Backend Environment Variables

Add your ngrok and Vercel URLs to the backend `.env` file:

```bash
# In backend/.env
CORS_ORIGINS=http://localhost:4000,http://localhost:3000,https://your-static-domain.ngrok-free.app,https://mes-ui-staging.vercel.app
```

### 3. Set Up Vercel

#### Option A: Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Link your project (run from frontend directory)
cd frontend
vercel link

# Set environment variables
vercel env add NEXT_PUBLIC_GRAPHQL_URL
# Enter: https://your-static-domain.ngrok-free.app/graphql

vercel env add NEXT_PUBLIC_API_URL
# Enter: https://your-static-domain.ngrok-free.app

# Add all other NEXT_PUBLIC_* variables (Azure AD, etc.)
```

#### Option B: Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Import your GitHub repository
3. Configure project:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Next.js
   - **Build Command**: `cd ../.. && npx turbo build --filter=@forge-mes/frontend`
   - **Install Command**: `cd ../.. && npm install`

4. Add Environment Variables:
   ```
   NEXT_PUBLIC_GRAPHQL_URL=https://your-static-domain.ngrok-free.app/graphql
   NEXT_PUBLIC_API_URL=https://your-static-domain.ngrok-free.app
   NEXT_PUBLIC_APP_ENV=staging

   # Azure AD (get from your Azure portal)
   NEXT_PUBLIC_AZURE_AD_CLIENT_ID=...
   NEXT_PUBLIC_AZURE_AD_TENANT_ID=...
   NEXT_PUBLIC_AZURE_CLIENT_ID=...
   NEXT_PUBLIC_AZURE_TENANT_ID=...
   NEXT_PUBLIC_AZURE_REDIRECT_URI=https://mes-ui-staging.vercel.app
   NEXT_PUBLIC_AZURE_AUTHORITY=https://login.microsoftonline.com/YOUR_TENANT_ID
   ```

### 4. Configure GitHub Actions (Optional)

For automatic Vercel deployments via GitHub Actions:

1. Get Vercel tokens:
   ```bash
   # Get your Vercel token
   vercel token create "GitHub Actions"

   # Get org and project IDs
   cd frontend
   vercel project ls
   ```

2. Add GitHub Secrets:
   - Go to repository Settings > Secrets and variables > Actions
   - Add these secrets:
     ```
     VERCEL_TOKEN=your_vercel_token
     VERCEL_ORG_ID=your_org_id
     VERCEL_PROJECT_ID=your_project_id
     STAGING_NGROK_URL=https://your-static-domain.ngrok-free.app
     STAGING_VERCEL_URL=https://mes-ui-staging.vercel.app

     # Azure AD secrets
     AZURE_AD_CLIENT_ID=...
     AZURE_AD_TENANT_ID=...
     AZURE_CLIENT_ID=...
     AZURE_TENANT_ID=...
     ```

## Daily Usage

### Starting the Staging Environment

```bash
# From repository root
./scripts/start-staging.sh

# Or with options:
./scripts/start-staging.sh --skip-build      # Skip backend build
./scripts/start-staging.sh --skip-docker     # Docker already running
```

This script will:
1. ✓ Check prerequisites (Docker, npm, PM2, ngrok)
2. ✓ Start Docker services (PostgreSQL, Redis, RabbitMQ)
3. ✓ Build backend (if needed)
4. ✓ Run database migrations
5. ✓ Start PM2 processes (backend, ngrok, health monitor)
6. ✓ Display connection information

**Expected output:**
```
========================================
Staging Environment Ready!
========================================

Backend:
  Local:    http://localhost:3000
  GraphQL:  http://localhost:3000/graphql
  ngrok:    https://your-domain.ngrok-free.app
  Public GraphQL: https://your-domain.ngrok-free.app/graphql

Frontend (Vercel):
  Set NEXT_PUBLIC_GRAPHQL_URL to: https://your-domain.ngrok-free.app/graphql

Monitoring:
  PM2 Dashboard:  pm2 monit
  PM2 Logs:       pm2 logs
  ngrok Inspector: http://localhost:4040

Useful Commands:
  View status:  pm2 status
  View logs:    pm2 logs
  Restart:      pm2 restart all
  Stop:         ./scripts/stop-staging.sh

✓ Staging environment is running!
```

### Monitoring

```bash
# View process status
pm2 status

# View real-time logs
pm2 logs

# View specific process logs
pm2 logs whk-backend-staging
pm2 logs ngrok-tunnel
pm2 logs ngrok-health-monitor

# Interactive monitoring dashboard
pm2 monit

# View ngrok requests (web interface)
open http://localhost:4040
```

### Stopping the Environment

```bash
# Stop PM2 processes only (keep Docker running)
./scripts/stop-staging.sh

# Stop everything including Docker
./scripts/stop-staging.sh --full
```

## Troubleshooting

### ngrok Tunnel Issues

**Problem**: "ngrok URL not available yet"
```bash
# Check ngrok logs
pm2 logs ngrok-tunnel

# Manually check tunnel status
curl http://localhost:4040/api/tunnels

# Restart ngrok
pm2 restart ngrok-tunnel
```

**Problem**: Tunnel keeps disconnecting
- The health monitor should automatically restart ngrok
- Check health monitor logs: `tail -f backend/logs/ngrok-health.log`
- Ensure you're using a paid ngrok plan with static domains

**Problem**: "Failed to bind to port"
- Port 3000 may be in use
- Check: `lsof -i :3000`
- Kill the process or change PORT in `.env`

### Backend Issues

**Problem**: Backend not responding through ngrok
```bash
# Check backend is running
pm2 status whk-backend-staging

# Test locally
curl http://localhost:3000/health

# Test through ngrok
curl https://your-domain.ngrok-free.app/health

# Check CORS settings in backend logs
pm2 logs whk-backend-staging | grep -i cors
```

**Problem**: Database connection errors
```bash
# Check Docker containers
docker ps

# Restart PostgreSQL
docker-compose -f backend/docker-compose.dev.yml restart db

# Check database is accessible
nc -zv localhost 5432
```

### Vercel Deployment Issues

**Problem**: Build fails
```bash
# Check build logs in Vercel dashboard
# Or test build locally:
cd frontend
npm run build

# Check shared library is built
cd ../shared
npm run build
```

**Problem**: Frontend can't connect to backend
- Verify `NEXT_PUBLIC_GRAPHQL_URL` in Vercel environment variables
- Check browser console for CORS errors
- Verify backend CORS_ORIGINS includes Vercel URL

**Problem**: Environment variables not updating
```bash
# Redeploy with new env vars
vercel env pull
vercel --prod  # or just push to trigger GitHub Actions
```

### GitHub Actions Issues

**Problem**: Workflow not triggering
- Check workflow file path: `.github/workflows/deploy-staging-vercel.yml`
- Verify branch name matches trigger (staging or main)
- Check "Actions" tab in GitHub for errors

**Problem**: Deployment succeeds but site doesn't work
- Check Vercel build logs in GitHub Actions
- Verify all environment variables are set in GitHub Secrets
- Test deployment URL directly

## Updating ngrok URL

If your ngrok URL changes (e.g., switching domains):

1. Update ngrok config:
   ```bash
   # Edit backend/ngrok.yml
   # Change domain: your-new-domain.ngrok-free.app
   ```

2. Update backend CORS:
   ```bash
   # Edit backend/.env
   # Update CORS_ORIGINS with new ngrok URL
   ```

3. Update Vercel environment variables:
   ```bash
   vercel env rm NEXT_PUBLIC_GRAPHQL_URL production
   vercel env add NEXT_PUBLIC_GRAPHQL_URL production
   # Enter new URL: https://your-new-domain.ngrok-free.app/graphql
   ```

4. Update GitHub Secrets (if using GitHub Actions):
   - Update `STAGING_NGROK_URL` secret

5. Restart everything:
   ```bash
   ./scripts/stop-staging.sh
   ./scripts/start-staging.sh
   ```

## Cost Breakdown

### Railway Backend (Recommended)
- **Railway**: ~$5-20/month (usage-based, includes database)
- **Vercel**: Free (hobby tier sufficient for staging)
- **Total**: **$5-20/month**

### ngrok Backend (Local Development)
- **ngrok**: $8/month (static domain essential for auto-reconnect)
- **Vercel**: Free (hobby tier sufficient for staging)
- **Total**: **$8/month** (plus local infrastructure costs)

## Security Considerations

1. **ngrok URL**: Publicly accessible - ensure authentication is enabled
2. **Environment Variables**: Never commit secrets to Git
3. **CORS**: Only allow specific Vercel domains in production
4. **Database**: Not exposed publicly (only via backend)
5. **Health Monitor**: Logs may contain sensitive URLs - ensure proper permissions

## Alternatives

### Running Without ngrok (Local Network Only)

If you only need access from your local network:

1. Find your local IP: `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux)
2. Update Vercel env vars to use your IP: `http://192.168.x.x:3000/graphql`
3. Skip ngrok in PM2: `pm2 delete ngrok-tunnel ngrok-health-monitor`
4. Note: This won't work for remote users or mobile devices outside your network

### Using Cloudflare Tunnel (Alternative to ngrok)

Cloudflare Tunnel is free but requires more setup:
- See: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

## Support

For issues:
1. Check logs: `pm2 logs`
2. Review troubleshooting section above
3. Check GitHub Issues
4. Contact DevOps team

## Appendix: File Structure

```
whk-recipe-configuration/
├── scripts/
│   ├── start-staging.sh           # Startup script
│   ├── stop-staging.sh            # Shutdown script
│   └── ngrok-health-monitor.sh    # Health monitoring
├── apps/
│   ├── whk-recipe-configuration/
│   │   ├── ngrok.yml              # ngrok configuration
│   │   ├── ecosystem.config.js    # PM2 configuration
│   │   ├── logs/                  # PM2 and ngrok logs
│   │   └── .ngrok-url             # Current ngrok URL (generated)
│   └── mes-ui/
│       ├── vercel.json            # Vercel configuration
│       └── next.config.ts         # Next.js config (updated for prod)
└── .github/
    └── workflows/
        └── deploy-staging-vercel.yml  # GitHub Actions
```

## Quick Reference

| Service | Local URL | Public URL |
|---------|-----------|------------|
| Backend | http://localhost:3000 | https://your-domain.ngrok-free.app |
| GraphQL | http://localhost:3000/graphql | https://your-domain.ngrok-free.app/graphql |
| Frontend | http://localhost:4000 | https://mes-ui-staging.vercel.app |
| ngrok Inspector | http://localhost:4040 | N/A |
| PostgreSQL | localhost:5432 | N/A (not exposed) |
| Redis | localhost:6379 | N/A (not exposed) |
| RabbitMQ | localhost:5672 | N/A (not exposed) |
| RabbitMQ Admin | http://localhost:15672 | N/A (not exposed) |

## Common Commands

```bash
# Start everything
./scripts/start-staging.sh

# Stop everything
./scripts/stop-staging.sh --full

# View status
pm2 status

# View logs
pm2 logs

# Restart just backend
pm2 restart whk-backend-staging

# Restart just ngrok
pm2 restart ngrok-tunnel

# Check ngrok URL
curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"'

# Deploy to Vercel manually
cd frontend && vercel --prod

# View Docker services
docker ps

# Restart PostgreSQL
make db-dev
```
