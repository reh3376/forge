// import modules
const XLSX = require('xlsx');
const fs = require('fs');

// File path
const filePath =
  '/Github/whk-mes-csv-importer/whk-csv-importer/WHK WHSE TTB.upload-for-backend1.CLEAN.xlsx';

const workbook = XLSX.readFile(filePath);

const sheetName = workbook.SheetNames[0];
const sheets = workbook.Sheets[sheetName];

// Read Excel
const [header, ...jsonData] = XLSX.utils.sheet_to_json(sheets, { header: 1 });

// Original key mappings (backend schema to spreadsheet column names)
const keyMappings = {
  'Avg. Bbl Fill: by PG': 'avgBblFillByPg',
  'Avg. Bbl Fill: by WG': 'avgBblFillByWg',
  'Avg PGs / Ferm': 'avgPGsFerm',
  'Bbl OEM:': 'bblOem',
  'Bbl Entry Proof: Pdi': 'bblEntryProof',
  'Grain - lbs / Ferm': 'grainLbsFerm',
  'Density (final): Df': 'densityFinal',
  'Grain - lbs / PG': 'grainLbsPg',
  'Standard Yield (PGs/56#)': 'standardYield',
  'PG Losses': 'pgLosses',
  'Total Ferms': 'totalFermenters',
  'Total Volume: WG': 'totalVolumeWg',
  'Total PGs by Recipe': 'totalPGsByRecipe',
  Confirmed: 'confirmed',
  'Whiskey Type': 'whiskeyType',
  'Total WGs': 'totalWGs',
  Notes: 'notes',
  'Total PGs': 'totalPGs',
  'Bbl Total': 'bblTotal',
  'Bbl Type': 'bblType',
  'LOT #': 'lotNumber',
  Date: 'lotCreatedAt',
  'WHK_WHSE#:': 'warehouseEntryNumber',
  Mashbill: 'recipe',
  'Total Weight: lbs': 'totalWeight',
  'Production Order ID': 'productionOrder',
  Complete: 'status',
  'Custom Backend': 'lotAlphaChar',
};

// Rename keys in each row
const renamedData = jsonData.map((row) => {
  const renamedRow = {};
  header.forEach((key, index) => {
    const mappedKey = keyMappings[key] || key; // Map to the new key or keep the original
    renamedRow[mappedKey] = row[index] || null; // Assign value to the new key
  });
  return renamedRow;
});

// Save renamed data to a JSON file
fs.writeFileSync(
  'renamedData.json',
  JSON.stringify(renamedData, null, 2),
  'utf8'
);
