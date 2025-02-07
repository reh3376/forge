# WHK Recipe Configuration Service

A backend service for managing and configuring manufacturing recipes built with NestJS, Prisma ORM, and GraphQL.

## Technology Stack

- NestJS - Backend framework
- Prisma - ORM and database management
- GraphQL - API query language
- Docker - Containerization
- PM2 - Process manager
- Jest - Testing framework

## Prerequisites

- Node.js (>= 18.x)
- npm or yarn
- Docker and Docker Compose
- PM2 (for production deployment)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/whk-recipe-configuration.git
cd whk-recipe-configuration
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Install dotenv-vault CLI if you haven't already
npm install -g dotenv-vault

# Pull environment variables
npx dotenv-vault pull
```

## Database Setup

This service uses Prisma as the ORM. Here are the key database commands:

```bash
# Generate Prisma client
npm run prisma:generate

# Development: Initialize database with initial migration
npm run db:dev:init

# Development: Clean database
npm run db:dev:clean

# Production: Deploy migrations
npm run db:prod:deploy
```

## Development

Start the development server:

```bash
# Watch mode
npm run start:dev:watch

# Debug mode
npm run start:dev:debug

# With Docker
npm run docker:dev
```

### Seeding Data

```bash
# Seed development data
npm run dev:seed

# Seed production data
npm run prod:seed

# Seed specific data types
npm run prod:seed:tests
npm run prod:seed:assets
npm run prod:seed:unit
npm run prod:seed:recipeParameters
```

### Code Quality

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:dev:fix

# Format code
npm run format:dev
```

## Production Deployment

```bash
# Build the application
npm run build

# Start with PM2
npm run prod:start
```

### Docker Deployment

```bash
# Build container
npm run package:dev:container

# Start services
npm run compose:dev:up

# Stop services
npm run compose:dev:down
```

## Testing

```bash
# Run tests
npm test
```

## Project Structure

```
src/
├── controllers/    # Route controllers
├── models/        # Data models and types
├── resolvers/     # GraphQL resolvers
├── services/      # Business logic
├── validators/    # Custom validators
└── prisma/        # Database schema and migrations
```

## Environment Variables

This project uses dotenv-vault for secure environment variable management. Contact the development team for access to the environment variables.

Required environment variables include:
- DATABASE_URL
- JWT_SECRET
- AZURE_KEYVAULT_URL
- Other service-specific variables

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Specify your license]

## Support

For support, please contact the development team or create an issue in the repository.