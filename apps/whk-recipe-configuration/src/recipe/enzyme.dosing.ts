// EnzymeDosingService Class

import { Injectable } from "@nestjs/common";

interface Enzyme {
  category: string;
  name: string;
  dosePerMetricTon: number;
  instructions: string;
}

@Injectable()
export class EnzymeDosingService {
  private static GRAM_PER_LB = 453.592;
  private static METRIC_TON_DIVISOR = 2205;

  private enzymeList: Enzyme[] = [
    { category: 'Liquifaction', name: 'Termamyl SC DS', dosePerMetricTon: 0.130, instructions: 'with water/backset before grain' },
    { category: 'Liquifaction', name: 'Liquozyme PRO HP DI', dosePerMetricTon: 0.185, instructions: 'with water/backset before grain' },
    { category: 'Liquifaction', name: 'Amylex 6T', dosePerMetricTon: 0.250, instructions: 'with water/backset before grain' },
    { category: 'Liquifaction', name: 'Alphalase THP', dosePerMetricTon: 1.000, instructions: 'with water/backset before grain' },
    { category: 'Saccharification', name: 'Saczyme Pro 1.5X', dosePerMetricTon: 0.600, instructions: 'at 152 degrees F on crash' },
    { category: 'Saccharification', name: 'Saczyme Yield', dosePerMetricTon: 0.300, instructions: 'at 152 degrees F on crash' },
    { category: 'Saccharification', name: 'Diazyme SSF', dosePerMetricTon: 0.300, instructions: 'at 152 degrees F on crash' },
    { category: 'Saccharification', name: 'Diazyme SSF2', dosePerMetricTon: 0.800, instructions: 'at 152 degrees F on crash' },
    { category: 'Viscosity', name: 'Viscoferm', dosePerMetricTon: 0.100, instructions: 'at 152 degrees F on crash' },
    { category: 'Viscosity', name: 'Laminex C2K', dosePerMetricTon: 0.100, instructions: 'at 152 degrees F on crash' },
  ];

  // Normalize the keys to lowercase for case-insensitive mapping
  private enzymeMapping: { [key: string]: string } = {
    'termamyl': 'Termamyl SC DS',
    'liquozyme': 'Liquozyme PRO HP DI',
    'amylex': 'Amylex 6T',
    'alphalase': 'Alphalase THP',
    'saczyme': 'Saczyme Pro 1.5X',
    'diazyme': 'Diazyme SSF',
    'diazyme2': 'Diazyme SSF2',
    'viscoferm': 'Viscoferm',
    'laminex': 'Laminex C2K',
  };

  /**
   * Calculates enzyme dosing based on total grain load and mash bill.
   * @param totalGrainLoadLbs Total grain load in pounds.
   * @param mashBill Mash bill string (e.g., "70-21-00-09").
   * @param enzymeName Name of the enzyme type.
   * @returns Dosage information including dose and instructions.
   */
  public calculateEnzymeDosing(
    totalGrainLoadLbs: number,
    mashBill: string,
    enzymeName: string
  ): { dose: number; instructions: string } | null {
    // Check if the enzyme is Citric and skip processing if so
    if (enzymeName.toLowerCase() === 'citric') {
      console.log('Citric enzyme detected. Skipping dosing calculation.');
      return null;
    }

    const mashBillParts = mashBill.split('-').map(part => parseFloat(part));
    if (mashBillParts.length !== 4) {
      throw new Error('Mash bill must have four components separated by dashes.');
    }
    const [corn, rye, wheat, malt] = mashBillParts;
    const totalGrainMetricTons = totalGrainLoadLbs / EnzymeDosingService.METRIC_TON_DIVISOR;

    // Optionally, handle individual grain calculations if needed
    // For simplicity, we're using total metric tons for dosing

    // Normalize the enzymeName to lowercase for case-insensitive mapping
    const normalizedEnzymeName = enzymeName.toLowerCase();
    const fullEnzymeName = this.enzymeMapping[normalizedEnzymeName];
    if (!fullEnzymeName) {
      throw new Error(`Enzyme "${enzymeName}" is not recognized in the mapping.`);
    }

    const enzyme = this.enzymeList.find(e => e.name.toLowerCase() === fullEnzymeName.toLowerCase());
    if (!enzyme) {
      throw new Error(`Enzyme "${fullEnzymeName}" not found.`);
    }

    const dose = enzyme.dosePerMetricTon * totalGrainMetricTons;

    return {
      dose: parseFloat(dose.toFixed(3)),
      instructions: enzyme.instructions,
    };
  }
}