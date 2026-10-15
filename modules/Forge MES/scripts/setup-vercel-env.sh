#!/bin/bash

################################################################################
# Vercel Environment Variables Setup Script
#
# Sets up environment variables for the MES UI frontend on Vercel
################################################################################

set -e

cd "$(dirname "$0")/../frontend"

echo "Setting up Vercel environment variables for staging..."

# Backend URLs
vercel env add NEXT_PUBLIC_GRAPHQL_URL preview <<< "https://staging.whiskeyhouse.ngrok.dev/graphql"
vercel env add NEXT_PUBLIC_API_URL preview <<< "https://staging.whiskeyhouse.ngrok.dev"
vercel env add NEXT_PUBLIC_WEBSOCKET_URL preview <<< "https://staging.whiskeyhouse.ngrok.dev"
vercel env add NEXT_PUBLIC_APP_ENV preview <<< "staging"

echo "✓ Backend URLs configured"
echo ""
echo "Please manually configure Azure AD variables in Vercel dashboard:"
echo "  NEXT_PUBLIC_AZURE_AD_CLIENT_ID"
echo "  NEXT_PUBLIC_AZURE_AD_TENANT_ID"
echo "  NEXT_PUBLIC_AZURE_CLIENT_ID"
echo "  NEXT_PUBLIC_AZURE_TENANT_ID"
echo "  NEXT_PUBLIC_AZURE_REDIRECT_URI"
echo "  NEXT_PUBLIC_AZURE_AUTHORITY"
echo ""
echo "Visit: https://vercel.com/whiskey-house/mes-ui/settings/environment-variables"
