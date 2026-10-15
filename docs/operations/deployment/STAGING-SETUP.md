# Staging Environment - Final Setup Steps

## ✅ Completed
1. ✓ Created `mes-preview` branch and pushed to GitHub
2. ✓ Created deployment scripts (`deploy-backend-staging.sh`)
3. ✓ Configured ngrok with static domain (`staging.whiskeyhouse.ngrok.dev`)
4. ✓ Copied backend files to Raspberry Pi
5. ✓ Started Docker Compose on Raspberry Pi (may still be building)

## 📋 Next Steps

### 1. Complete Vercel Setup

Go to: https://vercel.com/whiskey-house/mes-ui

#### A. Configure Git Branch
- **Settings** → **Git**
- Set **Production Branch** to: `mes-preview`
- OR set **Preview Branch** to: `mes-preview`

#### B. Add Environment Variables
- **Settings** → **Environment Variables**
- Add these for **Preview** environment:

```
NEXT_PUBLIC_GRAPHQL_URL = https://staging.whiskeyhouse.ngrok.dev/graphql
NEXT_PUBLIC_API_URL = https://staging.whiskeyhouse.ngrok.dev
NEXT_PUBLIC_WEBSOCKET_URL = https://staging.whiskeyhouse.ngrok.dev
NEXT_PUBLIC_APP_ENV = staging

# Azure AD (get from your existing .env)
NEXT_PUBLIC_AZURE_AD_CLIENT_ID = [your-value]
NEXT_PUBLIC_AZURE_AD_TENANT_ID = [your-value]
NEXT_PUBLIC_AZURE_CLIENT_ID = [your-value]
NEXT_PUBLIC_AZURE_TENANT_ID = [your-value]
NEXT_PUBLIC_AZURE_REDIRECT_URI = https://mes-ui-[your-vercel-url].vercel.app
NEXT_PUBLIC_AZURE_AUTHORITY = https://login.microsoftonline.com/[tenant-id]
```

#### C. Update Build Settings (if needed)
- **Settings** → **General** → **Build & Development Settings**
- Framework Preset: **Next.js**
- Root Directory: `frontend`
- Build Command: (leave default or set to `npm run build`)
- Install Command: (leave default or set to `npm install`)

#### D. Deploy
- Go to **Deployments**
- Click **Redeploy** for the latest `mes-preview` commit
- OR just push a new commit to `mes-preview` branch

---

### 2. Finish Backend Setup on Raspberry Pi

SSH into your Pi:
```bash
ssh pi@192.168.0.108
```

#### A. Check Docker Status
```bash
cd ~/whk-staging
docker compose ps
```

#### B. Check Backend Logs
```bash
docker compose logs -f backend
```

#### C. Install ngrok on Pi
```bash
# Download ngrok for ARM
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Configure with your authtoken
ngrok config add-authtoken ***REMOVED***
```

#### D. Start ngrok Tunnel
```bash
cd ~/whk-staging/backend
ngrok start whk-backend-staging --config ./ngrok.yml --log stdout
```

Or set up as a systemd service (recommended):
```bash
# Create systemd service file
sudo nano /etc/systemd/system/whk-ngrok.service
```

Paste this content:
```ini
[Unit]
Description=ngrok tunnel for WhiskeyHouse MES Staging
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/whk-staging/backend
ExecStart=/usr/bin/ngrok start whk-backend-staging --config ./ngrok.yml --log stdout
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable whk-ngrok
sudo systemctl start whk-ngrok
sudo systemctl status whk-ngrok
```

---

### 3. Update Backend CORS for Vercel URL

After Vercel deploys, get the deployment URL (e.g., `https://mes-ui-abc123.vercel.app`)

Then update backend CORS on the Pi:
```bash
cd ~/whk-staging
nano .env
```

Add your Vercel URL to `CORS_ORIGINS`:
```bash
CORS_ORIGINS=http://localhost:4000,https://staging.whiskeyhouse.ngrok.dev,https://mes-ui-[your-url].vercel.app
```

Restart backend:
```bash
docker compose restart backend
```

---

### 4. Verify Everything Works

#### Test Backend
```bash
curl https://staging.whiskeyhouse.ngrok.dev/health
# Should return OK or a status page
```

#### Test Frontend
- Go to your Vercel deployment URL
- Should load the MES UI
- Check browser console for errors
- Try to connect to GraphQL backend

---

## 🔄 Future Deployments

### Deploy Backend Updates
```bash
# From your local machine
./scripts/deploy-backend-staging.sh
```

### Deploy Frontend Updates
```bash
git checkout mes-preview
# Make changes to frontend
git add .
git commit -m "feat: your changes"
git push origin mes-preview
# Vercel will auto-deploy
```

---

## 📊 Monitoring

### Check Backend Logs
```bash
ssh pi@192.168.0.108 "cd ~/whk-staging && docker compose logs -f backend"
```

### Check ngrok Tunnel
```bash
ssh pi@192.168.0.108 "sudo journalctl -u whk-ngrok -f"
```

### Check All Containers
```bash
ssh pi@192.168.0.108 "cd ~/whk-staging && docker compose ps"
```

---

## 🔗 URLs

- **Backend (local)**: http://192.168.0.108:3000
- **Backend (ngrok)**: https://staging.whiskeyhouse.ngrok.dev
- **GraphQL**: https://staging.whiskeyhouse.ngrok.dev/graphql
- **Frontend**: [Your Vercel URL]
- **ngrok Dashboard**: http://192.168.0.108:4040 (when running)
- **RabbitMQ Admin**: http://192.168.0.108:15672 (user/password)

---

## ⚠️ Troubleshooting

### Backend won't start
```bash
ssh pi@192.168.0.108
cd ~/whk-staging
docker compose down
docker compose up -d
docker compose logs backend
```

### ngrok tunnel down
```bash
# If using systemd
sudo systemctl restart whk-ngrok

# Or manually
ngrok start whk-backend-staging --config ./ngrok.yml
```

### CORS errors
- Check backend logs: `docker compose logs backend | grep -i cors`
- Verify Vercel URL is in `CORS_ORIGINS` in `.env`
- Restart backend after changes

### Database connection errors
```bash
docker compose ps  # Check if postgres is running
docker compose logs postgres
```

---

## 📝 Notes

- Backend is running on Raspberry Pi at your home (192.168.0.108)
- ngrok provides public HTTPS access
- Frontend is hosted on Vercel
- Database, Redis, and RabbitMQ are in Docker on the Pi
- For production, you mentioned on-prem hosting (different setup)
