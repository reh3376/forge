# Database Seeding Scripts

This directory contains scripts for seeding the database with initial data and templates.

## ERP Units Loader

The `load-erp-units.ts` script loads unit of measure data from ERP systems into the Units table.

### Features

- ✅ Transforms ERP unit data to match the Units table schema
- ✅ Checks for conflicts with existing units
- ✅ Preserves ERP metadata in the conversions JSON field
- ✅ Sets `mesConfiguredUnit` to `false` for ERP units
- ✅ Provides preview mode to review data before loading
- ✅ Comprehensive error handling and reporting
- ✅ Database statistics after loading

### Prerequisites

1. Make sure you have the database connection configured
2. Ensure you're in the project root directory
3. Have Node.js and npm/yarn installed

### Usage

#### Preview Mode (Recommended First Step)
```bash
npx ts-node scripts/database/seeding/load-erp-units.ts --preview
```

This will show you exactly what units will be loaded, grouped by type, without making any changes to the database.

#### Load Units with Confirmation
```bash
npx ts-node scripts/database/seeding/load-erp-units.ts
```

This will show the preview and ask for confirmation before proceeding.

#### Force Load (Skip Confirmation)
```bash
npx ts-node scripts/database/seeding/load-erp-units.ts --force
```

This will load the units without asking for confirmation.

#### Help
```bash
npx ts-node scripts/database/seeding/load-erp-units.ts --help
```

### Data Structure

The script loads 21 units across different categories:

- **Barrel** (2 units): bbl, gal
- **Each** (1 unit): ea
- **Mass (Enz|Yea)** (3 units): kg, lb, ctr10
- **Mass (Pound)** (10 units): lb, oz, kg, bsh-b, bsh-r, bsh-c, bsh-w, US ton
- **Time** (1 unit): hr
- **Volume (Gallon)** (4 units): gal, ml, l, 9le, bbl

### Conflict Detection

The script checks for:
- Duplicate unit names with the same revision
- Duplicate abbreviations
- Reports existing units and whether they are MES configured

### Error Handling

- Individual unit creation failures don't stop the entire process
- Detailed error reporting for each failed unit
- Summary statistics at the end
- Graceful database disconnection

### Database Schema Mapping

ERP fields are mapped to Units table fields as follows:

| ERP Field | Units Field | Notes |
|-----------|-------------|-------|
| `abbreviation` | `abbreviation` | Direct mapping |
| `active` | `active` | Direct mapping |
| `archived` | `archived` | Direct mapping |
| `conversions` | `conversions` | JSON parsed + ERP metadata added |
| `createdBy` | `createdBy` | Direct mapping |
| `name` | `name` | Direct mapping |
| `revision` | `revision` | Direct mapping |
| `updatedBy` | `updatedBy` | Direct mapping |
| N/A | `mesConfiguredUnit` | Set to `false` |

### Conversions JSON Structure

The conversions field contains:
```json
{
  "conversionRate": 1.0,
  "unitType": "Barrel",
  "inUse": true,
  "toBaseUnit": 1.0,
  "fromBaseUnit": 1.0,
  "erpId": "11",
  "baseUnitId": null,
  "isBaseUnit": true,
  "pluralAbbreviation": "bbls",
  "pluralName": "Barrels",
  "transactionStatus": "PENDING",
  "transactionType": "CREATE"
}
```

### Troubleshooting

#### Common Issues

1. **Database Connection Error**
   - Ensure your database is running
   - Check your `.env` file for correct DATABASE_URL

2. **Prisma Client Error**
   - Run `npx prisma generate` to regenerate the client
   - Ensure you're in the correct directory

3. **Conflict Errors**
   - Review existing units in the database
   - Consider updating existing units instead of creating new ones
   - Check if units should be archived instead

4. **Permission Errors**
   - Ensure your database user has CREATE permissions
   - Check if the Units table exists

#### Viewing Existing Units

To see what units are already in the database:
```sql
SELECT id, name, abbreviation, revision, "mesConfiguredUnit", active 
FROM "Units" 
ORDER BY name, revision;
```

#### Cleaning Up Test Data

If you need to remove the loaded units:
```sql
-- BE CAREFUL: This removes all non-MES units
DELETE FROM "Units" WHERE "mesConfiguredUnit" = false;
```

### Audit Trail

When the application's audit middleware is active, all unit creations will be automatically logged to the audit table with:
- Action: CREATE
- Entity Type: Units
- User: system (for ERP imports)
- IP: internal
- User Agent: erp-units-loader

### Next Steps

After loading the units:
1. Verify the data in your database
2. Test unit conversions in your application
3. Update any existing recipes or items to use the new units
4. Consider creating relationships between related units

### Support

If you encounter issues:
1. Check the error messages in the console output
2. Review the database logs
3. Ensure all prerequisites are met
4. Contact the development team with specific error details

## Mashing Protocol Template Seeding

### Overview

The `seed-mashing-protocol-template.ts` script creates a comprehensive mashing protocol template based on the GSC Rye Bourbon recipe (00-95-00-05). This template can be used as a starting point for creating new mashing protocols for similar whiskey types.

### Features

- **Template Creation**: Creates a master mashing protocol template marked as `isTemplate: true`
- **Step Generation**: Creates 10 detailed mashing protocol steps based on the original GSC recipe
- **BOM Item Linking**: Automatically links appropriate BOM items (grains, enzymes, additives) to relevant steps
- **Equipment Parameters**: Includes temperature setpoints, timing, agitator settings, and heating/cooling controls
- **Template Replication**: Includes utility function to create recipe-specific protocols from templates

### Template Details

**Template Name**: GSC Rye Bourbon Template 00-95-00-05  
**Category**: RyeBourbon  
**Steps**: 10 sequential steps covering the complete mashing process

#### Mashing Steps Created:

1. **Liquid Addition** - Add Water and Backset
2. **Heat Hold** - Heat to 130°F
3. **Malt Addition** - Add Malt grain
4. **Enzyme Addition** - Add Liquozyme enzyme
5. **Rye Addition** - Add Rye grain
6. **Time Hold** - Hold for 5 minutes
7. **Enzyme Addition** - Add DIAZYME enzyme
8. **Enzyme Addition** - Add Laminex enzyme
9. **Heat Hold** - Heat to 145°F and hold for 30 minutes
10. **Optional Addition** - Add Citric Acid (optional)

#### Linked BOM Items:

- **Malt**: BRY-MNA01-Malt
- **Rye**: RYE-SCO02-Rye #2, RYE-SCO01-Malted Rye, RYE-CGB01-Malted Rye
- **Enzymes**: 
  - Liquozyme: ENZ-UNI04-Enzyme (Liquozyme Pro)
  - DIAZYME: ENZ-GUS02-Enzyme (DIAZYME SSF2)
  - Laminex: ENZ-GUS01-Enzyme (Laminex C2K)
- **Additives**: 
  - Citric Acid: CIT-TMP01-Citric (Citric Acid), ADD-CIT-01 Citric Acid

### Usage

#### Running the Seeding Script

```bash
# From the project root
npm run seed:mashing-protocol

# Or directly with ts-node
npx ts-node scripts/database/seeding/seed-mashing-protocol-template.ts
```

#### Using the Template in Code

```typescript
import { createMashingProtocolFromTemplate } from './scripts/database/seeding/seed-mashing-protocol-template';

// Create a recipe-specific mashing protocol from the template
const newProtocol = await createMashingProtocolFromTemplate(
  'template-id-here',
  'My Custom Recipe Name',
  'user@whiskeyhouse.com'
);
```

### Database Requirements

The script requires the following to be present in the database:

1. **Items**: The referenced items (grains, enzymes, additives) must exist in the `Item` table
2. **Enums**: The following enum values must be available:
   - `EnumMashingProtocolTemplateCategory.RyeBourbon`
   - `EnumMashingProtocolStepStepType` values (Hold, LiquidAdd, Malt, Rye, AdditiveAdd)
   - `EnumMashingProtocolStepHoldType` values (Heat, Hold)
   - `EnumRecipeBomItemOperation.Mashing01`

### Error Handling

The script includes comprehensive error handling:

- **Duplicate Prevention**: Checks if template already exists before creation
- **Item Validation**: Warns if referenced items are not found in the database
- **Transaction Safety**: Uses Prisma transactions where appropriate
- **Graceful Failures**: Continues processing even if individual BOM item links fail

### Output

The script provides detailed console output including:

- Template creation confirmation
- Step-by-step creation progress
- BOM item linking status
- Final summary with template ID and statistics
- Warning messages for missing items or failed operations

### Extending the Template

To create additional templates:

1. Copy the `MASHING_PROTOCOL_TEMPLATE` object and modify the name, category, and description
2. Update the `MASHING_PROTOCOL_STEPS` array with your specific steps
3. Modify the `ITEM_MAPPINGS` object to reference your specific items
4. Run the script to create the new template

### Database Schema

The script interacts with the following tables:

- `MashingProtocol` - Main template record
- `MashingProtocolStep` - Individual process steps
- `RecipeBomItem` - BOM items for linking
- `_MashingProtocolStepToRecipeBomItem` - Many-to-many relationship table
- `Item` - Referenced materials and ingredients

### Notes

- Template BOM items are created with quantity = 0 as placeholders
- Water and Backset items may need to be added to the database separately
- The template is marked as `master: true` and `isTemplate: true`
- All timestamps and user references use system defaults 