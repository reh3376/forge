#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';

// ERP Units data from the user
const erpUnitsData = {
  "data": {
    "units": [
      {
        "abbreviation": "bbl",
        "active": true,
        "archived": false,
        "baseUnitId": null,
        "conversions": "{\"conversionRate\":1,\"unitType\":\"Barrel\",\"inUse\":true,\"toBaseUnit\":1,\"fromBaseUnit\":1}",
        "createdAt": "2025-06-03T01:40:11.007Z",
        "createdBy": "ERP",
        "erpId": "11",
        "isBaseUnit": true,
        "name": "Barrel",
        "pluralAbbreviation": "bbls",
        "pluralName": "Barrels",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Barrel",
        "updatedAt": "2025-06-03T01:40:11.008Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "gal",
        "active": true,
        "archived": false,
        "baseUnitId": "11",
        "conversions": "{\"conversionRate\":0.01887,\"unitType\":\"Barrel\",\"inUse\":false,\"toBaseUnit\":0.01887,\"fromBaseUnit\":52.99417064122946}",
        "createdAt": "2025-06-03T01:40:11.009Z",
        "createdBy": "ERP",
        "erpId": "41",
        "isBaseUnit": false,
        "name": "Gallon",
        "pluralAbbreviation": "gal",
        "pluralName": "Gallons",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Barrel",
        "updatedAt": "2025-06-03T01:40:11.009Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "ea",
        "active": true,
        "archived": false,
        "baseUnitId": null,
        "conversions": "{\"conversionRate\":1,\"unitType\":\"Each\",\"inUse\":false,\"toBaseUnit\":1,\"fromBaseUnit\":1}",
        "createdAt": "2025-06-03T01:40:11.042Z",
        "createdBy": "ERP",
        "erpId": "30",
        "isBaseUnit": true,
        "name": "Each",
        "pluralAbbreviation": "ea",
        "pluralName": "Eaches",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Each",
        "updatedAt": "2025-06-03T01:40:11.042Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "kg",
        "active": true,
        "archived": false,
        "baseUnitId": null,
        "conversions": "{\"conversionRate\":1,\"unitType\":\"Mass (Enz|Yea)\",\"inUse\":true,\"toBaseUnit\":1,\"fromBaseUnit\":1}",
        "createdAt": "2025-06-03T01:40:11.084Z",
        "createdBy": "ERP",
        "erpId": "35",
        "isBaseUnit": true,
        "name": "Kilogram",
        "pluralAbbreviation": "kgs",
        "pluralName": "Kilograms",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Enz|Yea)",
        "updatedAt": "2025-06-03T01:40:11.084Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "lb",
        "active": true,
        "archived": false,
        "baseUnitId": "35",
        "conversions": "{\"conversionRate\":0.45359237,\"unitType\":\"Mass (Enz|Yea)\",\"inUse\":true,\"toBaseUnit\":0.45359237,\"fromBaseUnit\":2.2046226218487757}",
        "createdAt": "2025-06-03T01:40:11.085Z",
        "createdBy": "ERP",
        "erpId": "37",
        "isBaseUnit": false,
        "name": "Pound",
        "pluralAbbreviation": "lbs",
        "pluralName": "Pounds",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Enz|Yea)",
        "updatedAt": "2025-06-03T01:40:11.085Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "ctr10",
        "active": true,
        "archived": false,
        "baseUnitId": "35",
        "conversions": "{\"conversionRate\":10,\"unitType\":\"Mass (Enz|Yea)\",\"inUse\":true,\"toBaseUnit\":10,\"fromBaseUnit\":0.1}",
        "createdAt": "2025-06-03T01:40:11.086Z",
        "createdBy": "ERP",
        "erpId": "38",
        "isBaseUnit": false,
        "name": "Container10kg",
        "pluralAbbreviation": "ctrs10",
        "pluralName": "Containers10kg",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Enz|Yea)",
        "updatedAt": "2025-06-03T01:40:11.086Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "lb",
        "active": true,
        "archived": false,
        "baseUnitId": null,
        "conversions": "{\"conversionRate\":1,\"unitType\":\"Mass (Pound)\",\"inUse\":true,\"toBaseUnit\":1,\"fromBaseUnit\":1}",
        "createdAt": "2025-06-03T01:40:11.157Z",
        "createdBy": "ERP",
        "erpId": "13",
        "isBaseUnit": true,
        "name": "Pound",
        "pluralAbbreviation": "lb",
        "pluralName": "Pounds",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Pound)",
        "updatedAt": "2025-06-03T01:40:11.157Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "oz",
        "active": true,
        "archived": false,
        "baseUnitId": "13",
        "conversions": "{\"conversionRate\":0.0625,\"unitType\":\"Mass (Pound)\",\"inUse\":false,\"toBaseUnit\":0.0625,\"fromBaseUnit\":16}",
        "createdAt": "2025-06-03T01:40:11.158Z",
        "createdBy": "ERP",
        "erpId": "14",
        "isBaseUnit": false,
        "name": "Ounce",
        "pluralAbbreviation": "oz",
        "pluralName": "Ounces",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Pound)",
        "updatedAt": "2025-06-03T01:40:11.158Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "kg",
        "active": true,
        "archived": false,
        "baseUnitId": "13",
        "conversions": "{\"conversionRate\":2.20462,\"unitType\":\"Mass (Pound)\",\"inUse\":true,\"toBaseUnit\":2.20462,\"fromBaseUnit\":0.45359290943563974}",
        "createdAt": "2025-06-03T01:40:11.159Z",
        "createdBy": "ERP",
        "erpId": "31",
        "isBaseUnit": false,
        "name": "Kilogram",
        "pluralAbbreviation": "kg",
        "pluralName": "Kilograms",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Pound)",
        "updatedAt": "2025-06-03T01:40:11.159Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "bsh-b",
        "active": true,
        "archived": false,
        "baseUnitId": "13",
        "conversions": "{\"conversionRate\":34,\"unitType\":\"Mass (Pound)\",\"inUse\":true,\"toBaseUnit\":34,\"fromBaseUnit\":0.029411764705882353}",
        "createdAt": "2025-06-03T01:40:11.160Z",
        "createdBy": "ERP",
        "erpId": "25",
        "isBaseUnit": false,
        "name": "Barley Bushel",
        "pluralAbbreviation": "bshls-b",
        "pluralName": "Barley Bushels",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Pound)",
        "updatedAt": "2025-06-03T01:40:11.160Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "bsh-r",
        "active": true,
        "archived": false,
        "baseUnitId": "13",
        "conversions": "{\"conversionRate\":56,\"unitType\":\"Mass (Pound)\",\"inUse\":true,\"toBaseUnit\":56,\"fromBaseUnit\":0.017857142857142856}",
        "createdAt": "2025-06-03T01:40:11.161Z",
        "createdBy": "ERP",
        "erpId": "24",
        "isBaseUnit": false,
        "name": "Rye Bushel",
        "pluralAbbreviation": "bshls-r",
        "pluralName": "Rye Bushels",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Pound)",
        "updatedAt": "2025-06-03T01:40:11.161Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "bsh-c",
        "active": true,
        "archived": false,
        "baseUnitId": "13",
        "conversions": "{\"conversionRate\":56,\"unitType\":\"Mass (Pound)\",\"inUse\":true,\"toBaseUnit\":56,\"fromBaseUnit\":0.017857142857142856}",
        "createdAt": "2025-06-03T01:40:11.162Z",
        "createdBy": "ERP",
        "erpId": "22",
        "isBaseUnit": false,
        "name": "Corn Bushel",
        "pluralAbbreviation": "bshls-c",
        "pluralName": "Corn Bushels",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Pound)",
        "updatedAt": "2025-06-03T01:40:11.162Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "bsh-w",
        "active": true,
        "archived": false,
        "baseUnitId": "13",
        "conversions": "{\"conversionRate\":60,\"unitType\":\"Mass (Pound)\",\"inUse\":true,\"toBaseUnit\":60,\"fromBaseUnit\":0.016666666666666666}",
        "createdAt": "2025-06-03T01:40:11.163Z",
        "createdBy": "ERP",
        "erpId": "23",
        "isBaseUnit": false,
        "name": "Wheat Bushel",
        "pluralAbbreviation": "bshls-w",
        "pluralName": "Wheat Bushels",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Pound)",
        "updatedAt": "2025-06-03T01:40:11.163Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "US ton",
        "active": true,
        "archived": false,
        "baseUnitId": "13",
        "conversions": "{\"conversionRate\":2000,\"unitType\":\"Mass (Pound)\",\"inUse\":false,\"toBaseUnit\":2000,\"fromBaseUnit\":0.0005}",
        "createdAt": "2025-06-03T01:40:11.164Z",
        "createdBy": "ERP",
        "erpId": "15",
        "isBaseUnit": false,
        "name": "Short Ton",
        "pluralAbbreviation": "US ton",
        "pluralName": "Short Ton",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Mass (Pound)",
        "updatedAt": "2025-06-03T01:40:11.164Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "hr",
        "active": true,
        "archived": false,
        "baseUnitId": null,
        "conversions": "{\"conversionRate\":1,\"unitType\":\"Time\",\"inUse\":false,\"toBaseUnit\":1,\"fromBaseUnit\":1}",
        "createdAt": "2025-06-03T01:40:11.196Z",
        "createdBy": "ERP",
        "erpId": "29",
        "isBaseUnit": true,
        "name": "Hour",
        "pluralAbbreviation": "hrs",
        "pluralName": "Hours",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Time",
        "updatedAt": "2025-06-03T01:40:11.196Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "gal",
        "active": true,
        "archived": false,
        "baseUnitId": null,
        "conversions": "{\"conversionRate\":1,\"unitType\":\"Volume (Gallon)\",\"inUse\":true,\"toBaseUnit\":1,\"fromBaseUnit\":1}",
        "createdAt": "2025-06-03T01:40:11.240Z",
        "createdBy": "ERP",
        "erpId": "26",
        "isBaseUnit": true,
        "name": "Gallon",
        "pluralAbbreviation": "gal",
        "pluralName": "Gallons",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Volume (Gallon)",
        "updatedAt": "2025-06-03T01:40:11.240Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "ml",
        "active": true,
        "archived": false,
        "baseUnitId": "26",
        "conversions": "{\"conversionRate\":0.00026417,\"unitType\":\"Volume (Gallon)\",\"inUse\":false,\"toBaseUnit\":0.00026417,\"fromBaseUnit\":3785.4411931710642}",
        "createdAt": "2025-06-03T01:40:11.241Z",
        "createdBy": "ERP",
        "erpId": "32",
        "isBaseUnit": false,
        "name": "Milliliter",
        "pluralAbbreviation": "ml",
        "pluralName": "Milliliters",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Volume (Gallon)",
        "updatedAt": "2025-06-03T01:40:11.242Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "l",
        "active": true,
        "archived": false,
        "baseUnitId": "26",
        "conversions": "{\"conversionRate\":0.264172,\"unitType\":\"Volume (Gallon)\",\"inUse\":false,\"toBaseUnit\":0.264172,\"fromBaseUnit\":3.785412534257983}",
        "createdAt": "2025-06-03T01:40:11.242Z",
        "createdBy": "ERP",
        "erpId": "33",
        "isBaseUnit": false,
        "name": "Liter",
        "pluralAbbreviation": "l",
        "pluralName": "Liters",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Volume (Gallon)",
        "updatedAt": "2025-06-03T01:40:11.242Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "9le",
        "active": true,
        "archived": false,
        "baseUnitId": "26",
        "conversions": "{\"conversionRate\":2.37755,\"unitType\":\"Volume (Gallon)\",\"inUse\":false,\"toBaseUnit\":2.37755,\"fromBaseUnit\":0.42060103888456607}",
        "createdAt": "2025-06-03T01:40:11.243Z",
        "createdBy": "ERP",
        "erpId": "28",
        "isBaseUnit": false,
        "name": "9Liter",
        "pluralAbbreviation": "9ls",
        "pluralName": "9Liters",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Volume (Gallon)",
        "updatedAt": "2025-06-03T01:40:11.243Z",
        "updatedBy": "ERP"
      },
      {
        "abbreviation": "bbl",
        "active": true,
        "archived": false,
        "baseUnitId": "26",
        "conversions": "{\"conversionRate\":53,\"unitType\":\"Volume (Gallon)\",\"inUse\":false,\"toBaseUnit\":53,\"fromBaseUnit\":0.018867924528301886}",
        "createdAt": "2025-06-03T01:40:11.244Z",
        "createdBy": "ERP",
        "erpId": "27",
        "isBaseUnit": false,
        "name": "Barrel53",
        "pluralAbbreviation": "bbls",
        "pluralName": "Barrels",
        "revision": 0,
        "transactionInitiator": "ERP",
        "transactionStatus": "PENDING",
        "transactionType": "CREATE",
        "unitType": "Volume (Gallon)",
        "updatedAt": "2025-06-03T01:40:11.244Z",
        "updatedBy": "ERP"
      }
    ]
  }
};

interface ERPUnit {
  abbreviation: string;
  active: boolean;
  archived: boolean;
  baseUnitId: string | null;
  conversions: string;
  createdAt: string;
  createdBy: string;
  erpId: string;
  isBaseUnit: boolean;
  name: string;
  pluralAbbreviation: string;
  pluralName: string;
  revision: number;
  transactionInitiator: string;
  transactionStatus: string;
  transactionType: string;
  unitType: string;
  updatedAt: string;
  updatedBy: string;
}

interface TransformedUnit {
  abbreviation: string;
  active: boolean;
  archived: boolean;
  conversions: any;
  createdBy: string;
  name: string;
  mesConfiguredUnit: boolean;
  revision: number;
  updatedBy: string;
}

/**
 * Transform ERP unit data to match our Units table schema
 */
function transformERPUnit(erpUnit: ERPUnit): TransformedUnit {
  // Parse the conversions JSON string
  let conversions;
  try {
    conversions = JSON.parse(erpUnit.conversions);
    // Add additional metadata for our system
    conversions.erpId = erpUnit.erpId;
    conversions.baseUnitId = erpUnit.baseUnitId;
    conversions.isBaseUnit = erpUnit.isBaseUnit;
    conversions.pluralAbbreviation = erpUnit.pluralAbbreviation;
    conversions.pluralName = erpUnit.pluralName;
    conversions.transactionStatus = erpUnit.transactionStatus;
    conversions.transactionType = erpUnit.transactionType;
  } catch (error) {
    console.warn(`Failed to parse conversions for unit ${erpUnit.name}:`, error);
    conversions = {
      erpId: erpUnit.erpId,
      baseUnitId: erpUnit.baseUnitId,
      isBaseUnit: erpUnit.isBaseUnit,
      unitType: erpUnit.unitType,
      conversionRate: 1,
      toBaseUnit: 1,
      fromBaseUnit: 1,
      inUse: erpUnit.active,
      pluralAbbreviation: erpUnit.pluralAbbreviation,
      pluralName: erpUnit.pluralName,
      transactionStatus: erpUnit.transactionStatus,
      transactionType: erpUnit.transactionType,
    };
  }

  return {
    abbreviation: erpUnit.abbreviation,
    active: erpUnit.active,
    archived: erpUnit.archived,
    conversions,
    createdBy: erpUnit.createdBy,
    name: erpUnit.name,
    mesConfiguredUnit: false, // These are ERP units, not MES configured
    revision: erpUnit.revision,
    updatedBy: erpUnit.updatedBy,
  };
}

/**
 * Check for potential conflicts with existing units
 */
async function checkForConflicts(prisma: PrismaClient, units: TransformedUnit[]): Promise<void> {
  console.log('🔍 Checking for conflicts with existing units...');
  
  const existingUnits = await prisma.units.findMany({
    select: {
      id: true,
      name: true,
      abbreviation: true,
      revision: true,
      mesConfiguredUnit: true,
    },
  });

  const conflicts: string[] = [];

  for (const unit of units) {
    const nameConflict = existingUnits.find(
      (existing: { id: string; name: string; abbreviation: string; revision: number | null; mesConfiguredUnit: boolean | null }) => existing.name === unit.name && existing.revision === unit.revision
    );
    
    const abbreviationConflict = existingUnits.find(
      (existing: { id: string; name: string; abbreviation: string; revision: number | null; mesConfiguredUnit: boolean | null }) => existing.abbreviation === unit.abbreviation
    );

    if (nameConflict) {
      conflicts.push(
        `Unit name "${unit.name}" (revision ${unit.revision}) already exists (ID: ${nameConflict.id}, MES: ${nameConflict.mesConfiguredUnit})`
      );
    }

    if (abbreviationConflict && abbreviationConflict.id !== nameConflict?.id) {
      conflicts.push(
        `Unit abbreviation "${unit.abbreviation}" already exists for "${abbreviationConflict.name}" (ID: ${abbreviationConflict.id}, MES: ${abbreviationConflict.mesConfiguredUnit})`
      );
    }
  }

  if (conflicts.length > 0) {
    console.error('❌ Conflicts detected:');
    conflicts.forEach((conflict) => console.error(`  - ${conflict}`));
    throw new Error(`Found ${conflicts.length} conflicts. Please resolve them before proceeding.`);
  }

  console.log('✅ No conflicts detected');
}

/**
 * Load units into the database
 */
async function loadUnits(): Promise<void> {
  const prisma = new PrismaClient();
  
  try {
    console.log('🚀 Starting ERP Units loading process...');
    
    // Transform the ERP units data
    const transformedUnits = erpUnitsData.data.units.map(transformERPUnit);
    console.log(`📊 Transformed ${transformedUnits.length} units from ERP data`);

    // Check for conflicts
    await checkForConflicts(prisma, transformedUnits);

    console.log('💾 Loading units into database...');
    
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const unit of transformedUnits) {
      try {
        console.log(`  📝 Creating unit: ${unit.name} (${unit.abbreviation})`);
        
        const createdUnit = await prisma.units.create({
          data: unit,
        });

        console.log(`  ✅ Created unit: ${createdUnit.name} (ID: ${createdUnit.id})`);
        successCount++;
      } catch (error) {
        const errorMessage = `Failed to create unit ${unit.name}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`  ❌ ${errorMessage}`);
        errors.push(errorMessage);
        errorCount++;
      }
    }

    // Summary
    console.log('\n📊 Loading Summary:');
    console.log(`  ✅ Successfully loaded: ${successCount} units`);
    console.log(`  ❌ Failed to load: ${errorCount} units`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    if (successCount > 0) {
      console.log('\n🎉 ERP Units loading completed successfully!');
      
      // Show some statistics
      const totalUnits = await prisma.units.count();
      const erpUnits = await prisma.units.count({
        where: { mesConfiguredUnit: false },
      });
      const mesUnits = await prisma.units.count({
        where: { mesConfiguredUnit: true },
      });

      console.log('\n📈 Database Statistics:');
      console.log(`  Total units: ${totalUnits}`);
      console.log(`  ERP units: ${erpUnits}`);
      console.log(`  MES units: ${mesUnits}`);
    }

  } catch (error) {
    console.error('💥 Fatal error during units loading:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Show preview of what will be loaded
 */
function showPreview(): void {
  console.log('👀 Preview of units to be loaded:');
  console.log('=====================================');
  
  const transformedUnits = erpUnitsData.data.units.map(transformERPUnit);
  
  // Group by unit type for better visualization
  const unitsByType: { [key: string]: TransformedUnit[] } = {};
  
  transformedUnits.forEach((unit) => {
    const unitType = unit.conversions.unitType || 'Unknown';
    if (!unitsByType[unitType]) {
      unitsByType[unitType] = [];
    }
    unitsByType[unitType].push(unit);
  });

  Object.entries(unitsByType).forEach(([type, units]) => {
    console.log(`\n📦 ${type} (${units.length} units):`);
    units.forEach((unit) => {
      const baseInfo = unit.conversions.isBaseUnit ? ' [BASE]' : '';
      const activeInfo = unit.active ? '✅' : '❌';
      console.log(`  ${activeInfo} ${unit.name} (${unit.abbreviation})${baseInfo}`);
    });
  });

  console.log(`\n📊 Total: ${transformedUnits.length} units to be loaded`);
  console.log('=====================================\n');
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--preview') || args.includes('-p')) {
    showPreview();
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log('ERP Units Loader');
    console.log('================');
    console.log('');
    console.log('Usage:');
    console.log('  npx ts-node scripts/database/seeding/load-erp-units.ts [options]');
    console.log('');
    console.log('Options:');
    console.log('  --preview, -p    Show preview of units to be loaded');
    console.log('  --help, -h       Show this help message');
    console.log('  --force          Skip confirmation prompt');
    console.log('');
    console.log('Examples:');
    console.log('  npx ts-node scripts/database/seeding/load-erp-units.ts --preview');
    console.log('  npx ts-node scripts/database/seeding/load-erp-units.ts --force');
    console.log('  npx ts-node scripts/database/seeding/load-erp-units.ts');
    return;
  }

  // Show preview first
  showPreview();
  
  // Ask for confirmation unless --force is used
  if (!args.includes('--force')) {
    console.log('⚠️  This will load the above units into the database.');
    console.log('   Make sure you have reviewed the data and checked for conflicts.');
    console.log('   Press Ctrl+C to cancel, or press Enter to continue...');
    
    // Wait for user input
    await new Promise((resolve) => {
      process.stdin.once('data', resolve);
    });
  }

  await loadUnits();
}

// Execute if run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
}

export { transformERPUnit, loadUnits, showPreview }; 