FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Allow build-time environment specification
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Set NEXT_PUBLIC_ variables at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GRAPHQL_URL
ARG NEXT_PUBLIC_WEBSOCKET_URL
ARG NEXT_PUBLIC_HEALTH_SOCKET_URL
ARG NEXT_PUBLIC_AUTH_ENABLED
ARG NEXT_PUBLIC_APP_ENV

# Azure AD environment variables for authentication
ARG NEXT_PUBLIC_AZURE_AD_CLIENT_ID
ARG NEXT_PUBLIC_AZURE_AD_TENANT_ID
ARG NEXT_PUBLIC_AZURE_CLIENT_ID
ARG NEXT_PUBLIC_AZURE_TENANT_ID
ARG NEXT_PUBLIC_AZURE_REDIRECT_URI
ARG NEXT_PUBLIC_AZURE_LOGOUT_URI
ARG NEXT_PUBLIC_AZURE_AUTHORITY
ARG NEXT_PUBLIC_DISABLE_DEV_MODE
ARG NEXT_PUBLIC_ENABLE_DEMO_USER
ARG NEXT_PUBLIC_BACKEND_CONFIG

# Build the Next.js application (skip linting)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_SKIP_ESLINT=1
RUN npx next build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 4000

ENV PORT=4000
ENV HOSTNAME=0.0.0.0

# Start the application
CMD ["node", "server.js"] 