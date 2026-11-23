# Change Management Documentation

## Overview

This document covers the transition to the MES Order Management system, key differences from legacy processes, and procedures for ongoing change management.

## What Changed from Legacy Order Management

### Production Order Constraints (New)

The MES system enforces strict **one-of constraints** on Production Orders that may not have existed in previous workflows:

| Dimension | Legacy Approach | MES Approach |
|---|---|---|
| Customer | Could mix customers | **One customer per PrO** |
| Mash Bill | Loosely tracked | **One mash bill per PrO** (via recipe group) |
| Container Type | Flexible | **One container type per PrO** |
| Proof | Could vary | **One final proof per PrO** |
| BOM | Shared or absent | **One dedicated BOM per PrO** |
| FG Item Code | Manual or none | **Auto-generated per PrO** |

**Impact:** Orders that previously combined multiple customers, proofs, or container types into a single order must now be split into separate PrOs grouped under a Schedule Order.

### Schedule Order Grouping (New)

The two-tier order model (PrO + SchO) is new:

- **Before**: A single order might cover everything from recipe to fulfillment
- **Now**: PrOs define "what to produce for whom" and SchOs define "how to produce it as a batch"

This separation enables:
- Multi-customer production runs with proper allocation tracking
- Shared mashing/fermentation with individual barreling
- Better resource planning and queue management

### Recipe Instance System (New)

The master → running → instance pattern is new:

- **Before**: Recipe data was static or manually tracked
- **Now**: Active recipe copies are created per SchO, enabling modification during production while preserving the master template

Changes to recipes during production are:
- Tracked with full audit trails
- Compared against the master for deviation detection
- Versioned with before/after change history

### Auto-Generated Item Numbers (New)

Item numbers are now systematically generated:
- Format: `{CUSTOMER}-{MASHBILL}-{BARREL}-{PROOF}-R01`
- Encodes key dimensions for ERP traceability
- No manual item number entry

### Queue-Based Scheduling (New)

Production scheduling now uses an index-based queue:
- **Before**: Orders scheduled by date or manually sequenced
- **Now**: Integer-indexed queue with deterministic ordering
- Lookahead pattern pre-creates recipe instances for next-in-queue orders

## Key Differences Summary

### For Production Planners

| Task | Legacy | MES |
|---|---|---|
| Create an order | Single order with all details | PrO wizard with one-of constraints |
| Schedule production | Date-based scheduling | Queue-based with index ordering |
| Group orders | Manual grouping | SchO grouping by mash bill |
| Track materials | Manual or spreadsheet | BOM actuals with lot traceability |
| View progress | Manual status updates | Real-time cook/fermenter tracking |
| Plan resources | Manual estimation | Yield estimation system |

### For Operators

| Task | Legacy | MES |
|---|---|---|
| Start production | Manual setup | Queue activation, recipe auto-loaded |
| Record cook completion | Manual log | `recordCookComplete()` in MES |
| Track materials used | Manual log | BOM consumption recording with FIFO |
| Monitor progress | Visual/manual | Dashboard with % complete |
| Handle deviations | Manual notes | Automated deviation detection |

### For Quality

| Task | Legacy | MES |
|---|---|---|
| Recipe traceability | Manual records | Full master → instance chain |
| Material traceability | Lot books | RecipeBomActual with inventory link |
| Parameter tracking | Manual logs | RecipeParameterActual with limits |
| Deviation detection | Manual review | Automatic when values exceed limits |
| Audit trails | Paper or basic logs | AuditContextInterceptor on all mutations |

## Migration Considerations

### Data Migration

When migrating from legacy systems:

1. **Customer records** must exist before creating PrOs (customer code must match)
2. **Recipes and recipe groups** must be configured with proper mash bill assignments
3. **Item catalog** — existing items will be reused if the generated item number matches
4. **Units of measure** — must be pre-configured in the system
5. **Milling bin configurations** — must exist for bin assignment in the wizard

### In-Progress Orders

Orders that are mid-production during migration:
- Create corresponding PrOs and SchOs in the MES with appropriate statuses
- Set `executedCooks` and `executedFermenters` to reflect current progress
- Create SORIs manually if needed for ongoing tracking
- Coordinate with production floor for accurate status capture

### Historical Data

- Historical orders can be imported with status "Complete" for reference
- No need to create recipe instances for completed orders
- Item numbers should be generated consistently to match ERP records

## Training Schedule Recommendations

### Phase 1: Awareness (Week 1)

| Audience | Topic | Duration |
|---|---|---|
| All users | System overview and key changes | 1 hour |
| Planners | New order model (PrO + SchO) | 2 hours |
| Operators | Queue system and recording procedures | 1 hour |
| Quality | Traceability and audit improvements | 1 hour |

### Phase 2: Hands-On (Weeks 2-3)

| Audience | Topic | Duration |
|---|---|---|
| Planners | PrO wizard walkthrough | 2 hours |
| Planners | SchO grouping and queue management | 2 hours |
| Operators | Cook recording and BOM consumption | 2 hours |
| Quality | Recipe instance review and deviation handling | 2 hours |

### Phase 3: Supervised Production (Weeks 4-6)

- Shadow existing workflows with MES entry in parallel
- Designated support person available during shifts
- Daily review of issues and questions
- Adjust procedures based on feedback

### Phase 4: Independent Operation (Week 7+)

- MES becomes primary system
- Legacy system available as reference only
- Weekly check-ins for first month
- Troubleshooting guide available ([see Troubleshooting](./troubleshooting.md))

## Rollback Procedures

### If Issues Are Critical

1. **Identify the scope**: Which orders are affected?
2. **Assess data integrity**: Are PrOs, SchOs, and recipe instances consistent?
3. **Decision point**: Can the issue be fixed in MES, or is a rollback needed?

### Partial Rollback (Recommended)

- Continue using MES for new orders
- Handle affected orders manually or via Prisma Studio
- Fix the underlying issue before re-processing affected orders
- No data loss with this approach

### Full Rollback (Emergency Only)

- Revert to legacy system for all new orders
- Export any MES data needed for continuity
- Document all in-progress orders that need manual tracking
- Coordinate with development team for root cause analysis

### Data Recovery

- Database backups are available for point-in-time recovery
- Prisma Studio (`npx prisma studio`) provides direct database access for corrections
- Audit logs preserve all changes for reconstruction if needed

## Success Metrics

### Operational Metrics

| Metric | Target | How to Measure |
|---|---|---|
| Order creation time | < 5 minutes via wizard | Time from wizard start to PrO creation |
| Scheduling accuracy | > 90% on-time | Estimated vs actual start/end times |
| Queue throughput | Orders processed per day | Queue advance rate |
| BOM accuracy | < 5% variance planned vs actual | RecipeBomActual comparison |

### Adoption Metrics

| Metric | Target | How to Measure |
|---|---|---|
| Wizard usage | 100% of new PrOs | PrOs created via wizard vs manual |
| BOM recording | > 95% of materials tracked | RecipeBomActual records per SchO |
| Cook recording | 100% of cooks logged | executedCooks vs manual logs |
| Recipe compliance | 100% of active orders | SORIs created for all active SchOs |

### Quality Metrics

| Metric | Target | How to Measure |
|---|---|---|
| Lot traceability | 100% of materials | RecipeBomActual with lotNumber set |
| Deviation detection | < 2 hour detection time | Time from deviation to alert |
| Audit coverage | 100% of mutations | Audit log count vs mutation count |
| Recipe accuracy | < 1% undetected changes | Master vs instance comparison |

## Continuous Improvement Process

### Feedback Collection

1. **Weekly review meetings** (first 2 months): Gather feedback from all user groups
2. **Issue tracking**: Use the ticketing system for bug reports and feature requests
3. **Process observation**: Periodic floor walks to observe actual usage patterns

### Change Request Process

1. User submits a change request with description and justification
2. Production supervisor reviews and prioritizes
3. Development team assesses technical impact
4. Changes are implemented, tested, and deployed
5. Documentation updated ([see all docs](./README.md))
6. Users notified of changes and trained if needed

### Documentation Updates

This documentation set is maintained alongside the codebase:
- Technical details are verified against current service implementations
- Procedures are updated when system behavior changes
- Quick reference tables are kept current with schema changes
- Troubleshooting guides expanded as new issues are discovered

---

*See also: [Architecture](./architecture.md) | [Standard Operating Procedures](./standard-operating-procedures.md) | [Quick Reference](./quick-reference.md)*
