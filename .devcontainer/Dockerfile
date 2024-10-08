FROM mcr.microsoft.com/devcontainers/base:debian

# Install Node.js and npm
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get -y install curl \
  && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
  && apt-get -y install nodejs \
  && npm install -g npm@latest