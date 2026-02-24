# Robust Database Seeding System

A comprehensive, production-ready database seeding system for the Whiskey House recipe configuration application.

## 🌟 Features

### Core Capabilities

- **Transaction-based seeding** with automatic rollback on failure
- **Modular architecture** with dependency management
- **Comprehensive logging** with configurable log levels
- **Data validation** before and after seeding
- **Status tracking** with recovery from partial failures
- **Idempotent operations** - safe to run multiple times
- **Interactive CLI** with real-time progress monitoring

### Advanced Features

- **Dependency resolution** prevents circular dependencies
- **Selective seeding** - run specific modules or full suite
- **Error recovery** with detailed diagnostic information
- **Performance monitoring** with execution time tracking
- **Data integrity checks** with business logic validation
- **Extensible verification system** with custom checks

## 🚀 Quick Start

### Run All Seeds (Recommended)

```bash
npm run seed:all
```

### Interactive Mode

```bash
npm run seed:interactive
```

### Verify Data Integrity

```bash
npm run seed:verify
```

### Check Seed Status

```bash
npm run seed:status
```

### Test Seeding System

```bash
npm run seed:test
```

## 📋 Available Commands

### NPM Scripts

- `npm run seed` - Show help and available commands
- `npm run seed:all` - Run all seed modules
- `npm run seed:verify` - Run data verification checks
- `npm run seed:status` - Show current seed execution status
- `npm run seed:interactive` - Interactive mode with menu
- `npm run seed:robust` - Robust seeding with full error handling
- `npm run seed:test` - Run comprehensive test suite

### CLI Commands

```bash
# Run specific modules
npm run seed modules core-config items recipes

# List available modules
npm run seed list

# Reset seed status
npm run seed reset

# Run with custom environment
npm run seed all --env staging

# Enable verbose logging
npm run seed all --verbose

# Force re-seed (skip existing data checks)
npm run seed all --force

# Disable transactions (not recommended)
npm run seed all --no-transactions
```

## 🏗️ Architecture

### Directory Structure

```
scripts/seed/
├── cli.ts                 # Command-line interface
├── orchestrator.ts        # Main orchestration engine
├── config.ts             # Configuration and types
├── robust-seed.ts        # Production-ready seeding script
├── test-seed.ts          # Comprehensive test suite
├── README.md             # This documentation
├── modules/              # Seed modules
│   ├── index.ts          # Module loader
│   ├── core-config.ts    # Core system configuration
│   ├── vendors-customers.ts # Business relationships
│   ├── items.ts          # Items and materials
│   ├── recipes.ts        # Recipes and BOMs
│   ├── protocols.ts      # Mashing protocols
│   └── enzyme-config.ts  # Enzyme configurations
└── utils/                # Utilities
    ├── logger.ts         # Structured logging
    ├── status-tracker.ts # Status tracking system
    └── verifier.ts       # Data verification system
```

### Seed Modules

#### 1. Core Config (`core-config`)

- Recipe parameters
- Test parameters
- Unit links and lookups
- Item groups
- Milling bin configurations

#### 2. Vendors & Customers (`vendors-customers`)

- Vendor definitions with ERP IDs
- Customer information
- Business relationship foundations

#### 3. Items (`items`)

- Raw materials (grains, yeast, enzymes)
- Process aids (water, acids)
- Packaging materials (barrels)
- Finished goods (whiskey types)

#### 4. Recipes (`recipes`)

- Master recipes with grain bills
- Recipe groups and categories
- Recipe BOMs with percentages
- Item-to-recipe relationships

#### 5. Protocols (`protocols`)

- Mashing protocols for different whiskey types
- Detailed process steps with temperatures
- Time sequences and equipment controls
- Protocol-to-recipe relationships

#### 6. Enzyme Config (`enzyme-config`)

- Enzyme system configurations
- Dosage calculations
- Item-specific enzyme rules

## 🔧 Configuration

### Environment Variables

```bash
# Required
BCRYPT_SALT=12
DATABASE_URL="postgresql://user:pass@localhost:5432/db"

# Optional
NODE_ENV=development
SEED_LOG_LEVEL=info
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
```

### Configuration Options

```typescript
interface SeedConfig {
  environment: "development" | "production" | "staging";
  skipExistingData: boolean; // Skip if data exists
  enableTransactions: boolean; // Use database transactions
  enableValidation: boolean; // Run validation checks
  enableStatusTracking: boolean; // Track seed execution status
  logLevel: "debug" | "info" | "warn" | "error";
  batchSize: number; // Records per batch
}
```

## 🔍 Data Validation

The system includes comprehensive validation checks:

### Foreign Key Integrity

- Validates all foreign key relationships
- Detects orphaned records
- Ensures referential integrity

### Required Core Data

- Minimum record counts per table
- Validates essential business entities
- Checks for missing required relationships

### Data Consistency

- Recipe percentages validation
- Business logic constraints
- Enum value validation

### Custom Validation

Add custom validation checks:

```typescript
verifier.addCheck({
  name: "custom_business_rule",
  description: "Validates custom business logic",
  check: async (client) => {
    // Your validation logic here
    return { valid: true, message: "Check passed" };
  },
});
```

## 📊 Status Tracking

The system tracks execution status for each module:

```sql
-- Status tracking table
CREATE TABLE seed_status (
  id VARCHAR(255) PRIMARY KEY,
  module_name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  execution_time_ms INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### Check Status

```bash
npm run seed:status
```

### Reset Status

```bash
npm run seed reset [module-names...]
```

## 🧪 Testing

### Run Test Suite

```bash
npm run seed:test
```

### Test Categories

- **Orchestrator initialization** - System startup
- **Module loading** - Module registration
- **Dependency resolution** - Circular dependency detection
- **Single module execution** - Individual module testing
- **Transaction rollback** - Error recovery
- **Status tracking** - Progress monitoring
- **Data validation** - Integrity checks
- **Error handling** - Failure scenarios
- **Idempotency** - Safe re-execution
- **Partial recovery** - Resume from failures

## 🚨 Error Handling

### Common Issues and Solutions

#### Database Connection Issues

```
Error: Can't reach database server
```

**Solution:** Check DATABASE_URL and ensure database is running

#### Circular Dependencies

```
Error: Circular dependency detected involving module: X
```

**Solution:** Review module dependencies and remove circular references

#### Missing Environment Variables

```
Error: BCRYPT_SALT environment variable must be defined
```

**Solution:** Set required environment variables

#### Foreign Key Violations

```
Error: Foreign key constraint failed
```

**Solution:** Ensure dependencies are seeded first

### Recovery Procedures

1. **Check Status**

   ```bash
   npm run seed:status
   ```

2. **Verify Data**

   ```bash
   npm run seed:verify
   ```

3. **Reset and Retry**

   ```bash
   npm run seed reset
   npm run seed:all
   ```

4. **Partial Recovery**
   ```bash
   npm run seed modules failed-module-name
   ```

## 🔐 Security Considerations

- **Password Hashing:** Uses bcrypt with configurable salt
- **SQL Injection:** Uses Prisma ORM for safe queries
- **Environment Variables:** Sensitive data in environment variables
- **Transaction Isolation:** Database transactions prevent data corruption

## 🎯 Production Deployment

### Pre-deployment Checklist

1. ✅ Run test suite: `npm run seed:test`
2. ✅ Verify in staging environment
3. ✅ Backup production database
4. ✅ Set production environment variables
5. ✅ Test rollback procedures

### Production Execution

```bash
# Set production environment
export NODE_ENV=production
export SEED_LOG_LEVEL=warn

# Run robust seeding
npm run seed:robust
```

### Monitoring

- Monitor execution logs
- Check status tracking table
- Validate data integrity
- Monitor application performance

## 📈 Performance Optimization

### Configuration Tuning

```typescript
const config = createSeedConfig({
  batchSize: 1000, // Increase for large datasets
  enableValidation: false, // Disable for faster seeding
  logLevel: "warn", // Reduce logging overhead
});
```

### Database Optimization

- Use connection pooling
- Optimize database indexes
- Monitor query performance
- Consider parallel execution for large datasets

## 🤝 Contributing

### Adding New Modules

1. Create module file in `scripts/seed/modules/`
2. Implement `SeedModule` interface
3. Add to module loader in `modules/index.ts`
4. Update dependencies as needed
5. Add validation logic
6. Test thoroughly

### Example Module Template

```typescript
export const myModule: SeedModule = {
  name: "my-module",
  description: "Description of module functionality",
  dependencies: ["prerequisite-module"],
  priority: SEED_PRIORITIES.CUSTOM,
  enabled: true,

  runner: async (client, config) => {
    // Implementation logic
    return {
      success: true,
      message: "Success message",
      recordsCreated: 0,
      recordsUpdated: 0,
      errors: [],
      warnings: [],
      executionTimeMs: Date.now() - startTime,
    };
  },

  validator: async (client) => {
    // Validation logic
    return {
      valid: true,
      errors: [],
      warnings: [],
      recordsValidated: 0,
    };
  },
};
```

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Database Schema](../../prisma/schema.prisma)
- [Environment Setup Guide](../../README.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)

## 🆘 Support

For issues and questions:

1. Check this documentation
2. Review error messages and logs
3. Run diagnostic commands
4. Contact system administrator
5. Create issue in project repository

---

**Version:** 1.0.0  
**Last Updated:** $(date)  
**Maintainer:** Whiskey House Development Team
