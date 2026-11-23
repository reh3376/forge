# Railway Database Setup

This guide explains how to securely configure and use Railway database credentials for development and migration scripts.

## Setup

### 1. Create Environment File

Copy the example file and update with your Railway credentials:

```bash
cp .env.railway.example .env.railway
```

### 2. Edit `.env.railway`

Update the file with your actual Railway database credentials:

```bash
export DB_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/railway"
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/railway"
```

**Note**: This file is already in `.gitignore` and will NOT be committed to version control.

### 3. Load Environment Variables

Before running any migration or seed scripts, load the environment variables:

```bash
source .env.railway
```

## Usage

### Running Migration Scripts

After sourcing `.env.railway`, you can run migration scripts without prefixing DB_URL:

```bash
# Old way (NOT recommended - exposes credentials in shell history)
DB_URL=postgresql://postgres:password@host:port/railway npm run migrate:backfill-mashing-protocols

# New way (recommended)
source .env.railway
npm run migrate:backfill-mashing-protocols
```

### Available Migration Scripts

```bash
# Source environment first
source .env.railway

# Then run any of these scripts
npm run migrate:link-recipe-parameters
npm run migrate:cleanup-mashing-protocols
npm run migrate:backfill-mashing-protocols
npm run migrate:diagnose-bom-completeness
npm run migrate:populate-bom-items
npm run migrate:cleanup-bom-items
npm run migrate:verify-backfill
npm run migrate:copy-protocols-by-mashbill
```

### Running Prisma Studio

```bash
source .env.railway
npx prisma studio
```

## Using dev-railway.sh

The `dev-railway.sh` script has been updated to require the `RAILWAY_DB_URL` environment variable:

```bash
# Set up environment
source .env.railway

# Run backend with Railway database
./dev-railway.sh backend

# Run frontend
./dev-railway.sh frontend
```

## Security Best Practices

1. **Never commit** `.env.railway` to version control
2. **Never hardcode** database credentials in scripts or code
3. **Always use** environment variables for sensitive credentials
4. **Clear shell history** if you accidentally typed credentials in a command
5. **Use** `.env.railway.example` as a template without real credentials

## Troubleshooting

### Error: "RAILWAY_DB_URL environment variable is not set"

This means you forgot to source the environment file:

```bash
source .env.railway
```

### Error: "Can't connect to database"

1. Check that your credentials in `.env.railway` are correct
2. Verify you can connect to Railway from your network
3. Ensure the database is running in Railway

### Credentials in Git History

If you accidentally committed credentials:

1. Immediately rotate/change the credentials in Railway
2. Use `git filter-branch` or BFG Repo-Cleaner to remove from history
3. Contact your team lead

## Alternative: Using dotenv-vault

For team environments, consider using `dotenv-vault` for secure credential management:

```bash
npx dotenv-vault pull
```

See the main README for more details on dotenv-vault setup.
