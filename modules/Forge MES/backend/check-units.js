const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function showUnits() {
  const units = await prisma.units.findMany({
    select: {
      id: true,
      name: true,
      abbreviation: true,
      revision: true,
      mesConfiguredUnit: true,
      active: true,
      conversions: true,
    },
    orderBy: [{ mesConfiguredUnit: "desc" }, { name: "asc" }],
  });

  console.log("📊 Current Units in Database:");
  console.log("============================");

  const mesUnits = units.filter((u) => u.mesConfiguredUnit);
  const erpUnits = units.filter((u) => !u.mesConfiguredUnit);

  console.log("\n🔧 MES Configured Units:");
  mesUnits.forEach((unit) => {
    console.log(
      `  ✅ ${unit.name} (${unit.abbreviation}) - Rev: ${unit.revision}`
    );
  });

  console.log("\n📦 ERP Units by Type:");
  const erpByType = {};
  erpUnits.forEach((unit) => {
    const unitType = unit.conversions?.unitType || "Unknown";
    if (!erpByType[unitType]) erpByType[unitType] = [];
    erpByType[unitType].push(unit);
  });

  Object.entries(erpByType).forEach(([type, typeUnits]) => {
    console.log(`\n  📦 ${type} (${typeUnits.length} units):`);
    typeUnits.forEach((unit) => {
      const baseInfo = unit.conversions?.isBaseUnit ? " [BASE]" : "";
      const activeInfo = unit.active ? "✅" : "❌";
      console.log(
        `    ${activeInfo} ${unit.name} (${unit.abbreviation})${baseInfo}`
      );
    });
  });

  console.log(`\n📈 Summary:`);
  console.log(`  Total units: ${units.length}`);
  console.log(`  MES units: ${mesUnits.length}`);
  console.log(`  ERP units: ${erpUnits.length}`);

  await prisma.$disconnect();
}

showUnits().catch(console.error);
