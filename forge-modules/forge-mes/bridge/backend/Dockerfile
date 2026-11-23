# Define the default Node.js version
ARG NODE_VERSION=18.20.8

# multi-stage: base (build) - Build from monorepo root
FROM node:${NODE_VERSION} AS base

# Force cache invalidation
ARG CACHEBUST=1

# Add New Relic Env Vars
ENV NEW_RELIC_NO_CONFIG_FILE=true
ENV NEW_RELIC_DISTRIBUTED_TRACING_ENABLED=true
ENV NEW_RELIC_LOG=stdout

# Set working directory to monorepo root
WORKDIR /monorepo

# Copy root package files
COPY package*.json ./
COPY turbo.json ./

# Copy workspace package files
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/

# Install all dependencies (monorepo)
RUN npm install

# Copy shared library
COPY shared ./shared

# Build shared library
RUN cd shared && npm run build

# Copy backend app
COPY backend ./backend

# Change to backend directory
WORKDIR /monorepo/backend

# Generate Prisma client
RUN npm run prisma:generate

# Build backend
RUN npm run build

# multi-stage: production (runtime)
FROM node:${NODE_VERSION}-slim AS production

# create arguments of builds time variables
ARG user=amplication
ARG group=${user}
ARG uid=1001
ARG gid=$uid

# [temporary] work around to be able to run prisma
RUN apt-get update -y && apt-get install -y openssl

# add the user and group
RUN groupadd --gid ${gid} ${user}
RUN useradd --uid ${uid} --gid ${gid} -m ${user}

# Copy entire monorepo structure to preserve node_modules hoisting
COPY --from=base /monorepo /monorepo

# Set working directory to backend app
WORKDIR /monorepo/backend

# change ownership
RUN chown -R ${uid}:${gid} /monorepo/

# set user to the created non-privileged user
USER ${user}

# expose a specific port on the docker container
ENV PORT=3000
EXPOSE ${PORT}

# Set NODE_PATH to find modules in monorepo node_modules
ENV NODE_PATH=/app/node_modules

# start the server using the previously built application
# Generate Prisma client at startup (workaround for cross-platform build issues)
# Run migrations to ensure database schema is up to date
CMD sh -c "npx prisma generate && npx prisma migrate deploy && node ./dist/main.js"