#!/bin/bash
# Wrapper script to test migration against Railway database
# Usage: Set DATABASE_URL environment variable before running:
#   DATABASE_URL="your-railway-url" ./test-migration-railway.sh [--execute]

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is required"
  echo "Usage: DATABASE_URL=\"your-railway-url\" ./test-migration-railway.sh [--execute]"
  exit 1
fi

node backend/scripts/sql/migrate-bom-to-recipe-bom.js "$@"
