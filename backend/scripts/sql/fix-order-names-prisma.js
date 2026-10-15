// Script to fix NULL/empty ProductionOrder and ScheduleOrder names
// Format: PROYYYJJJNNN or SHOYYYJJJNNN where:
// YY = 2-digit year, JJJ = Julian day (day of year), NNN = sequence number

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Function to calculate Julian day (day of year)
function getJulianDay(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// Function to pad numbers with leading zeros
function padNumber(num, size) {
  let s = num.toString();
  while (s.length < size) s = "0" + s;
  return s;
}

// Function to generate a name with the new format
function generateName(prefix, date, sequenceNum) {
  // Get last 2 digits of the year (e.g., 24 for 2024)
  const year = date.getFullYear().toString().slice(-2);
  const julianDay = getJulianDay(date);
  return `${prefix}${year}${padNumber(julianDay, 3)}${padNumber(
    sequenceNum,
    3
  )}`;
}

async function fixProductionOrderNames() {
  console.log("Fixing ProductionOrder names...");

  // Get all ProductionOrder records with NULL/empty names
  const orders = await prisma.productionOrder.findMany({
    where: {
      name: null,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${orders.length} ProductionOrder records with NULL names`);

  // Process each order
  for (const order of orders) {
    // Get the date
    const orderDate = order.createdAt;

    // Get last 2 digits of the year
    const year = orderDate.getFullYear().toString().slice(-2);
    const julianDay = getJulianDay(orderDate);

    // Find other orders from the same day to determine sequence number
    const sameDate = await prisma.productionOrder.findMany({
      where: {
        createdAt: {
          gte: new Date(
            orderDate.getFullYear(),
            orderDate.getMonth(),
            orderDate.getDate()
          ),
          lt: new Date(
            orderDate.getFullYear(),
            orderDate.getMonth(),
            orderDate.getDate() + 1
          ),
        },
        name: {
          not: null,
          startsWith: `PRO${year}${padNumber(julianDay, 3)}`,
        },
      },
    });

    // Generate new name
    const sequenceNum = sameDate.length + 1;
    const newName = generateName("PRO", orderDate, sequenceNum);

    // Update the record
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { name: newName },
    });

    console.log(`Updated ProductionOrder ${order.id} with name ${newName}`);
  }

  console.log("ProductionOrder name updates complete");
}

async function fixScheduleOrderNames() {
  console.log("Fixing ScheduleOrder names...");

  // Get all ScheduleOrder records with NULL/empty names
  const orders = await prisma.scheduleOrder.findMany({
    where: {
      name: null,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${orders.length} ScheduleOrder records with NULL names`);

  // Process each order
  for (const order of orders) {
    // Get the date
    const orderDate = order.createdAt;

    // Get last 2 digits of the year
    const year = orderDate.getFullYear().toString().slice(-2);
    const julianDay = getJulianDay(orderDate);

    // Find other orders from the same day to determine sequence number
    const sameDate = await prisma.scheduleOrder.findMany({
      where: {
        createdAt: {
          gte: new Date(
            orderDate.getFullYear(),
            orderDate.getMonth(),
            orderDate.getDate()
          ),
          lt: new Date(
            orderDate.getFullYear(),
            orderDate.getMonth(),
            orderDate.getDate() + 1
          ),
        },
        name: {
          not: null,
          startsWith: `SHO${year}${padNumber(julianDay, 3)}`,
        },
      },
    });

    // Generate new name
    const sequenceNum = sameDate.length + 1;
    const newName = generateName("SHO", orderDate, sequenceNum);

    // Update the record
    await prisma.scheduleOrder.update({
      where: { id: order.id },
      data: { name: newName },
    });

    console.log(`Updated ScheduleOrder ${order.id} with name ${newName}`);
  }

  console.log("ScheduleOrder name updates complete");
}

// Main function
async function main() {
  try {
    await fixProductionOrderNames();
    await fixScheduleOrderNames();
    console.log("All name updates completed successfully");
  } catch (error) {
    console.error("Error updating names:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the main function
main();
