# Enzyme Configuration System

## Overview

The Enzyme Configuration System provides a database-driven approach to managing enzyme dosing calculations for whiskey production recipes. It replaces hardcoded enzyme configurations with a flexible, configurable system that maintains all existing calculation logic while adding database persistence and management capabilities.

## Architecture

### Components

1. **EnzymeConfigurationService** - Manages CRUD operations for enzyme configurations
2. **EnzymeDosingService** - Performs dosing calculations using database configurations
3. **Integration Layer** - Handles caching, error handling, and service communication

### Service Integration

```typescript
@Injectable()
export class EnzymeDosingService implements OnModuleInit {
  constructor(
    private readonly enzymeConfigurationService: EnzymeConfigurationService
  ) {}

  async onModuleInit() {
    await this.refreshEnzymeCache();
  }
}
```

## Key Features

### 1. Database-Driven Configuration

- Enzyme configurations stored in `EnzymeConfiguration` table
- Linked to items via `itemId` foreign key
- Categorized by enzyme type (LIQUIFACTION, SACCHARIFICATION, VISCOSITY)
- Configurable dosing rates per metric ton

### 2. Performance Caching

- 5-minute cache TTL for enzyme configurations
- Automatic cache refresh on expiry
- Manual cache refresh capability
- Optimized for high-frequency dosing calculations

### 3. Error Handling & Resilience

- Graceful degradation when database is unavailable
- Fallback mechanisms for service outages
- Comprehensive error logging
- Non-blocking error recovery

### 4. Case-Insensitive Lookups

- Flexible enzyme name matching
- Supports various naming conventions
- Category-based enzyme resolution

## Usage Examples

### Creating Enzyme Configurations

```typescript
const enzymeConfig: CreateEnzymeConfigurationDto = {
  itemId: "enzyme-item-id",
  category: EnumEnzymeCategory.VISCOSITY,
  dosePerMetricTon: 0.5,
  instructions: "Add at 152°F during mashing",
  createdBy: "user-id",
};

const created = await enzymeConfigService.create(enzymeConfig);
```

### Calculating Enzyme Dosing

```typescript
const mashBill = "70-21-00-09"; // corn-rye-wheat-malt
const enzymeName = "viscosity";

const dosing = await enzymeDosingService.calculateNormalizedEnzymeDosing(
  mashBill,
  enzymeName
);

if (dosing) {
  const actualDose = dosing.ratio * totalGrainWeight;
  console.log(`Dose: ${actualDose} lbs, Instructions: ${dosing.instructions}`);
}
```

### Updating Configurations

```typescript
const updateData: UpdateEnzymeConfigurationDto = {
  dosePerMetricTon: 0.6,
  instructions: "Updated dosing instructions",
  updatedBy: "user-id",
};

const updated = await enzymeConfigService.update(configId, updateData);
```

## API Endpoints

### EnzymeConfiguration Controller

- `GET /enzyme-configurations` - List all configurations with optional filters
- `GET /enzyme-configurations/for-dosing` - Get active configurations for dosing service
- `GET /enzyme-configurations/by-item/:itemId` - Get configuration by item ID
- `GET /enzyme-configurations/:id` - Get specific configuration
- `POST /enzyme-configurations` - Create new configuration
- `PATCH /enzyme-configurations/:id` - Update configuration
- `DELETE /enzyme-configurations/:id` - Soft delete (set active=false)
- `DELETE /enzyme-configurations/:id/hard` - Permanent deletion

## Database Schema

### EnzymeConfiguration Table

```sql
CREATE TABLE "EnzymeConfiguration" (
  "id" TEXT NOT NULL,
  "globalId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "category" "EnumEnzymeCategory" NOT NULL,
  "dosePerMetricTon" DOUBLE PRECISION NOT NULL,
  "instructions" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,

  CONSTRAINT "EnzymeConfiguration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnzymeConfiguration_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id")
);
```

### Indexes

- `EnzymeConfiguration_itemId_key` - Unique constraint on itemId
- `EnzymeConfiguration_category_active_idx` - Performance index for category + active queries
- `EnzymeConfiguration_active_idx` - Performance index for active configurations

## Integration Testing

The system includes comprehensive integration tests covering:

- Service dependency injection
- Database-driven dosing calculations
- Caching mechanism validation
- Error handling and fallbacks
- CRUD operation integration
- Performance and scalability testing

Run integration tests:

```bash
npm test -- enzyme-integration.spec.ts
```

## Migration from Hardcoded System

The integration maintains backward compatibility by:

1. **Preserving Calculation Logic** - All existing dosing algorithms remain unchanged
2. **Maintaining API Contracts** - Method signatures and return types preserved
3. **Graceful Fallbacks** - System continues working if database is unavailable
4. **Incremental Adoption** - Can be deployed alongside existing hardcoded configurations

## Performance Considerations

### Caching Strategy

- **Cache TTL**: 5 minutes (configurable)
- **Cache Size**: Unlimited (bounded by available enzyme configurations)
- **Refresh Strategy**: Automatic on expiry, manual refresh available
- **Memory Usage**: Minimal overhead for typical enzyme configuration counts

### Database Optimization

- Indexed queries for fast lookups
- Minimal data transfer with selective field loading
- Connection pooling for concurrent access
- Query optimization for category-based filtering

## Monitoring and Observability

### Logging

- Cache hit/miss ratios
- Database query performance
- Error rates and types
- Configuration change tracking

### Metrics

- Dosing calculation frequency
- Cache refresh intervals
- Database connection health
- Service response times

## Security Considerations

- **Input Validation**: All DTOs validated with class-validator
- **SQL Injection Prevention**: Prisma ORM provides protection
- **Access Control**: User-based creation/modification tracking
- **Data Integrity**: Foreign key constraints and validation rules

## Future Enhancements

1. **Real-time Cache Invalidation** - WebSocket-based cache updates
2. **Configuration Versioning** - Track configuration changes over time
3. **A/B Testing Support** - Multiple configuration sets for testing
4. **Advanced Analytics** - Usage patterns and optimization recommendations
5. **Configuration Templates** - Predefined enzyme configuration sets

## Troubleshooting

### Common Issues

1. **Cache Not Refreshing**

   - Check cache TTL configuration
   - Verify database connectivity
   - Review error logs for refresh failures

2. **Dosing Calculations Returning Null**

   - Verify enzyme configurations exist in database
   - Check enzyme name matching (case-insensitive)
   - Ensure configurations are marked as active

3. **Performance Issues**
   - Monitor cache hit ratios
   - Check database query performance
   - Review concurrent access patterns

### Debug Commands

```typescript
// Force cache refresh
await enzymeDosingService.refreshEnzymeCache();

// Check cache status
const cacheInfo = enzymeDosingService.getCacheInfo();

// Validate configuration
const config = await enzymeConfigService.findByItemId(itemId);
```
