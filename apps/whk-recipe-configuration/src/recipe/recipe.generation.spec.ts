import { Logger } from "@nestjs/common";
import { RecipeGenerator } from "./recipe.generation";
import { EnzymeDosingService } from "./enzyme.dosing";

describe("RecipeGenerator mash bill parsing", () => {
  const createGenerator = () => {
    const rabbitProducerStub = {} as any;
    const enzymeService = {
      calculateEnzymeDosing: jest.fn(),
    } as unknown as EnzymeDosingService;
    const loggerStub = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as unknown as Logger;

    return new RecipeGenerator(rabbitProducerStub, enzymeService, loggerStub);
  };

  it("handles decimal mash bill values when calculating grain quantities", () => {
    const generator = createGenerator();
    const result = (generator as any).calculateGrainQuantities(
      "68.5-10.5-00-21",
      1000
    );

    expect(result.Corn).toBe(685);
    expect(result.Rye).toBe(105);
    expect(result.Wheat).toBe(0);
    expect(result.Malt).toBe(210);
  });

  it("extracts decimal percentages when determining grain ratios", () => {
    const generator = createGenerator();
    const percentage = (generator as any).calculateGrainPercentage(
      "CORN",
      "68.5-10.5-00-21"
    );

    expect(percentage).toBeCloseTo(68.5, 5);
  });

  it("keeps triple-digit percentages intact when normalizing mash bills", () => {
    const generator = createGenerator();
    const values = (generator as any).getNormalizedMashBillValues("100-0-0-0");

    expect(values).toEqual([100, 0, 0, 0, 0]);
  });

  it("preserves negative percentages for validation detection", () => {
    const generator = createGenerator();
    const values = (generator as any).getNormalizedMashBillValues(
      "-20-70-30-0"
    );
    expect(values).toEqual([-20, 70, 30, 0, 0]);
  });

  it("handles 5-grain mash bills with specialty grain", () => {
    const generator = createGenerator();
    const result = (generator as any).calculateGrainQuantities(
      "40-20-15-15-10",
      1000
    );

    expect(result.Corn).toBe(400);
    expect(result.Rye).toBe(200);
    expect(result.Wheat).toBe(150);
    expect(result.Malt).toBe(150);
    expect(result.Specialty).toBe(100);
  });

  it("extracts 5 normalized values from 5-grain mash bill", () => {
    const generator = createGenerator();
    const values = (generator as any).getNormalizedMashBillValues(
      "40-20-15-15-10"
    );

    expect(values).toEqual([40, 20, 15, 15, 10]);
  });

  it("calculates specialty grain percentage correctly", () => {
    const generator = createGenerator();
    const percentage = (generator as any).calculateGrainPercentage(
      "SPECIALTY",
      "40-20-15-15-10"
    );

    expect(percentage).toBeCloseTo(10, 5);
  });

  it("pads 5-grain mash bill with zeros when fewer than 5 values provided", () => {
    const generator = createGenerator();
    const values = (generator as any).getNormalizedMashBillValues("70-20-10");

    expect(values).toEqual([70, 20, 10, 0, 0]);
  });
});
