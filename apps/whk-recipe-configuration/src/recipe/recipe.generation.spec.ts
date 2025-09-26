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

    expect(values).toEqual([100, 0, 0, 0]);
  });

  it("preserves negative percentages for validation detection", () => {
    const generator = createGenerator();
    const values = (generator as any).getNormalizedMashBillValues(
      "-20-70-30-0"
    );
    expect(values).toEqual([-20, 70, 30, 0]);
  });
});
