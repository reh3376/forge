const CUSTOMER_CODE = "JBM";
const MASH_BILL = '51-00-40-09'; //  Match Item Record
const FINAL_PROOF = 120;
const BARREL_INFO = '53-06-4-0-0'; // Match Item Record - rated capactiy-months of seasoning-char-toast-top/side fill
const CUSTOMER_NAME = "JBM Liquid Assets, LLC"; // This needs to match ERP / MESDB customer reocrd
const ORDER_QTY = 100; // barrels
const TOTAL_GRAIN_WEIGHT = 24080;
const BBLS_PER_FERM = 100;
const USER = 'csummers@whiskeyhouse.com';

const WATER_QTY = 3900;
const BACKSET_QTY = 3600;

const BBL_ITEM_NUMBERS = [
  'BBL-ISC02-53-06-4-0-0-Standard4',
  'BBL-WVG02-53-06-4-0-0-Standard4'
]

const YEAST_ITEM_NUMBERS_QTYS: { [key: string]: number } = {
  'YEA-FER01-Yeast (USW6)': 10,
}

/* 
MAXIMUM GRAIN WEIGHTS IN BINS 
(Normal bin assignment...)

Current total grain weight: 24080

Corn: 180000
Rye: 7000
Wheat: 7000
Malt: 1800


Each grain weight for the recipe is the % from the mash bill (Corn-Rye-Wheat-Malt) multiplied by total grain weight
But malt, 10% of the malt weight is the premalt, 90% is the big malt
*/

const MASHING_PROTOCOL = [
  { action: "Add Liquid", liquidType01: "Water", liquidType02: "Backset", notQty: 0 },
  { action: "Hold", holdType: "Heat", temperature: 130 },
  { action: "Add Additive", additiveType: "Citric", qty: 0 },
  { action: "Add Grain", grainType: "Malt", qty: 188 },
  { action: "Add Additive", additiveType: "Termamyl", qty: 1.4 },
  { action: "Add Grain", grainType: "Corn", qty: 12281 },
  // { action: "Hold", holdType: "Hold", time: 3 }, // UNCOMMENT IF NEED SECONDARY DROP
  // { action: "Add Grain", grainType: "Corn", qty: 20001 }, // UNCOMMENT IF NEED SECONDARY DROP
  { action: "Hold", holdType: "Heat", temperature: 180, time: 20 },
  { action: "Hold", holdType: "Cool", temperature: 170 },
  { action: "Add Grain", grainType: "Wheat", qty: 6500 },
  { action: "Hold", holdType: "Hold", time: 3 }, // UNCOMMENT IF NEED SECONDARY DROP
  { action: "Add Grain", grainType: "Wheat", qty: 3132 }, // UNCOMMENT IF NEED SECONDARY DROP
  { action: "Hold", holdType: "Hold", time: 15 },
  { action: "Hold", holdType: "Cool", temperature: 152 },
  { action: "Add Additive", additiveType: "DIAZYME", qty: 8.7 },
  { action: "Add Additive", additiveType: "Laminex", qty: 4.8 },
  { action: "Hold", holdType: "Cool", temperature: 145 },
  { action: "Add Grain", grainType: "Malt", qty: 1700 },
  { action: "Hold", holdType: "Hold", time: 3 }, // UNCOMMENT IF NEED SECONDARY DROP
  { action: "Add Grain", grainType: "Malt", qty: 279 }, // UNCOMMENT IF NEED SECONDARY DROP
  { action: "Hold", holdType: "Hold", time: 10 },
];
const RECIPE_PARAMETERS = [
  { name: 'HighWineProof', setpointValue: 140 },
  { name: 'LowWineProof', setpointValue: 130 },
  { name: 'FinalProof', setpointValue: 120 },
  { name: 'BaseLoss', setpointValue: 0.1 },
  { name: 'BeerFeedTray', setpointValue: 15 },
  { name: 'FermentationAge', setpointValue: 72 },
  { name: 'ControlTemperature', setpointValue: 92 },
  { name: 'CooksPerFerm', setpointValue: 3 },
    { name: 'TopOffFrequency', setpointValue: 24 },
    { name: 'TopOffQuantity', setpointValue: 100 },
    { name: 'TopOffTemperature', setpointValue: 80 },
    { name: 'MashpH', setpointValue: 5.1 },
    { name: 'MashRatio', setpointValue: 3.0 },
    { name: 'RatioByFerm', setpointValue: 2.8 },
    { name: 'FermSetTemp', setpointValue: 80 },
    { name: 'StarterSweetpH', setpointValue: 5.1 },
    { name: 'TotalGrainWeight', setpointValue: 20500 },
    { name: 'TotalLiquid', setpointValue: 70000 },
    { name: 'NumberOfCooks', setpointValue: ORDER_QTY * 3/ BBLS_PER_FERM },
    { name: 'AssumedFermABV', setpointValue: 12.5 }
  ];

  import axios from 'axios';
  import * as dotenv from 'dotenv';

  // Load the environment variables
  dotenv.config();

  async function generateRecipe() {
    try {

      // Login first to get JWT token
      const host = 'localhost';
      const base_url = `${process.env.APP_MODE}://${host}:${process.env.PORT}/api`;
      const url = `${base_url}/login`;
      console.log('Logging in to Mes...');
      const loginResponse = await axios.post(url, {
        username: process.env.MES_USER,
        password: process.env.MES_PASSWORD
      });

      const token = loginResponse.data.accessToken;
      console.log('Token:', token);

      // Set default auth header for subsequent requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      const response = await axios.post(`${base_url}/recipes/generate-recipe`, {
        customerCode: CUSTOMER_CODE,
        mashBill: MASH_BILL,
        finalProof: FINAL_PROOF,
        barrelInfo: BARREL_INFO,
        customerName: CUSTOMER_NAME,
        orderQty: ORDER_QTY,
        totalGrainWeight: TOTAL_GRAIN_WEIGHT,
        bblsPerFerm: BBLS_PER_FERM,
        username: USER,
        waterQty: WATER_QTY,
        backsetQty: BACKSET_QTY,
        bblItemNumbers: BBL_ITEM_NUMBERS,
        yeastItemNumbersQtys: YEAST_ITEM_NUMBERS_QTYS,
        mashingProtocol: MASHING_PROTOCOL,
        recipeParameters: RECIPE_PARAMETERS
      });

      console.log('Recipe generated successfully:', response.data);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error generating recipe:', error.message);
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        console.error('Error generating recipe:', (error as any).response?.data);
      } else {
        console.error('Error generating recipe:', error);
      }
      throw error;
    }
  }

  generateRecipe();