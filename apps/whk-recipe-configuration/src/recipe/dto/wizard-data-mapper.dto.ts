import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsEnum,
} from "class-validator";
import { Type } from "class-transformer";
import { InputType, Field, Float } from "@nestjs/graphql";
import {
  CreateMasterRecipeInput,
  UpdateMasterRecipeInput,
  MashBillComposition,
  RecipeIngredientInput,
  RecipeParameterInput,
  MashingStepInput,
  WhiskeyType,
} from "./master-recipe-input.dto";

/**
 * Frontend WizardData interface structure for reference:
 *
 * interface WizardData {
 *   details: {
 *     Recipe: string                    // → Recipe name
 *     whiskeyType: string              // → whiskeyType enum
 *     customerCode: string             // → customerCode
 *     cooksPerFerm: number             // → cooksPerFerm
 *     mashBill: {                      // → mashBill object
 *       corn: number
 *       rye: number
 *       wheat: number
 *       maltedBarley: number
 *     }
 *   }
 *   bom: {
 *     ingredients: Array<{             // → ingredients array
 *       itemCode: string               // → itemCode
 *       quantity: number               // → quantity
 *       unit: string                   // → unit
 *       category: 'water'|'grains'|... // → category
 *     }>
 *   }
 *   parameters: {                      // → parameters array
 *     highWineProof?: number           // → { name: 'High Wine Proof', value: X, unit: 'proof' }
 *     lowWineProof?: number            // → { name: 'Low Wine Proof', value: X, unit: 'proof' }
 *     mashRatio?: number               // → { name: 'Mash Ratio', value: X, unit: 'ratio' }
 *     fermentationTime?: number        // → { name: 'Fermentation Time', value: X, unit: 'hours' }
 *     [key: string]: any               // → { name: key, value: value, unit: '' }
 *   }
 *   mashing: {
 *     steps: Array<{                   // → mashingSteps array
 *       index: number                  // → index
 *       stepType: string               // → stepType
 *       holdType?: string              // → holdType
 *       temperatureSP?: number         // → temperatureSP
 *       timeDuration?: number          // → timeDuration
 *       waterBacksetSP?: number        // → waterBacksetSP
 *       additiveType?: string          // → additiveType
 *       included: boolean              // → included
 *       notes?: string                 // → notes
 *     }>
 *   }
 * }
 */

// Frontend WizardData structure DTOs
@InputType()
export class WizardDetailsInput {
  @ApiProperty({
    required: true,
    description: "Recipe name/identifier",
    example: "CUST001-75-21-00-04-v01",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  Recipe!: string;

  @ApiProperty({
    required: true,
    description: "Whiskey type",
    example: "FourGrainBourbon",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  whiskeyType!: string;

  @ApiProperty({
    required: true,
    description: "Customer code",
    example: "CUST001",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  customerCode!: string;

  @ApiProperty({
    required: true,
    description: "Number of cooks per fermentation",
    example: 4,
  })
  @IsNumber()
  @Field(() => Float)
  cooksPerFerm!: number;

  @ApiProperty({
    required: true,
    description: "Mash bill composition",
    type: () => MashBillComposition,
  })
  @ValidateNested()
  @Type(() => MashBillComposition)
  @Field(() => MashBillComposition)
  mashBill!: MashBillComposition;
}

@InputType()
export class WizardBomIngredientInput {
  @ApiProperty({
    required: true,
    description: "Item code/number",
    example: "CORN001",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  itemCode!: string;

  @ApiProperty({
    required: true,
    description: "Quantity",
    example: 750,
  })
  @IsNumber()
  @Field(() => Float)
  quantity!: number;

  @ApiProperty({
    required: true,
    description: "Unit of measurement",
    example: "lb",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  unit!: string;

  @ApiProperty({
    required: true,
    description: "Ingredient category",
    example: "grains",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  category!: string;
}

@InputType()
export class WizardBomInput {
  @ApiProperty({
    required: true,
    description: "Recipe ingredients/BOM",
    type: [WizardBomIngredientInput],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WizardBomIngredientInput)
  @Field(() => [WizardBomIngredientInput])
  ingredients!: WizardBomIngredientInput[];
}

@InputType()
export class WizardParametersInput {
  @ApiProperty({
    required: false,
    description: "High wine proof",
    example: 65.5,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  highWineProof?: number;

  @ApiProperty({
    required: false,
    description: "Low wine proof",
    example: 25.0,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  lowWineProof?: number;

  @ApiProperty({
    required: false,
    description: "Mash ratio",
    example: 3.5,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  mashRatio?: number;

  @ApiProperty({
    required: false,
    description: "Fermentation time in hours",
    example: 72,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  fermentationTime?: number;

  @ApiProperty({
    required: false,
    description: "Additional parameters as key-value pairs",
    example: { customParam1: 123.45, customParam2: 67.89 },
  })
  @IsOptional()
  @Field(() => String, { nullable: true })
  additionalParameters?: string; // JSON string of additional parameters
}

@InputType()
export class WizardMashingStepInput {
  @ApiProperty({
    required: true,
    description: "Step index/order",
    example: 1,
  })
  @IsNumber()
  @Field(() => Float)
  index!: number;

  @ApiProperty({
    required: true,
    description: "Step type",
    example: "LiquidAdd",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  stepType!: string;

  @ApiProperty({
    required: false,
    description: "Hold type",
    example: "Heat",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  holdType?: string;

  @ApiProperty({
    required: false,
    description: "Temperature setpoint",
    example: 180,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  temperatureSP?: number;

  @ApiProperty({
    required: false,
    description: "Time duration in minutes",
    example: 30,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  timeDuration?: number;

  @ApiProperty({
    required: false,
    description: "Water/backset setpoint",
    example: 1000,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  waterBacksetSP?: number;

  @ApiProperty({
    required: false,
    description: "Additive type",
    example: "enzyme",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  additiveType?: string;

  @ApiProperty({
    required: true,
    description: "Whether step is included",
    example: true,
  })
  @IsBoolean()
  @Field(() => Boolean)
  included!: boolean;

  @ApiProperty({
    required: false,
    description: "Step notes",
    example: "Add slowly while stirring",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  notes?: string;
}

@InputType()
export class WizardMashingInput {
  @ApiProperty({
    required: true,
    description: "Mashing protocol steps",
    type: [WizardMashingStepInput],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WizardMashingStepInput)
  @Field(() => [WizardMashingStepInput])
  steps!: WizardMashingStepInput[];
}

@InputType()
export class WizardDataInput {
  @ApiProperty({
    required: true,
    description: "Recipe details",
    type: () => WizardDetailsInput,
  })
  @ValidateNested()
  @Type(() => WizardDetailsInput)
  @Field(() => WizardDetailsInput)
  details!: WizardDetailsInput;

  @ApiProperty({
    required: true,
    description: "Recipe BOM",
    type: () => WizardBomInput,
  })
  @ValidateNested()
  @Type(() => WizardBomInput)
  @Field(() => WizardBomInput)
  bom!: WizardBomInput;

  @ApiProperty({
    required: true,
    description: "Recipe parameters",
    type: () => WizardParametersInput,
  })
  @ValidateNested()
  @Type(() => WizardParametersInput)
  @Field(() => WizardParametersInput)
  parameters!: WizardParametersInput;

  @ApiProperty({
    required: true,
    description: "Mashing protocol",
    type: () => WizardMashingInput,
  })
  @ValidateNested()
  @Type(() => WizardMashingInput)
  @Field(() => WizardMashingInput)
  mashing!: WizardMashingInput;

  @ApiProperty({
    required: true,
    description: "Creator username",
    example: "john.doe",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  createdBy!: string;

  @ApiProperty({
    required: false,
    description: "Recipe revision",
    example: "1",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  revision?: string;

  @ApiProperty({
    required: false,
    description: "Whether recipe is active",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, { nullable: true })
  active?: boolean;
}

/**
 * Utility class for mapping between frontend WizardData and backend DTOs
 */
export class WizardDataMapper {
  /**
   * Convert frontend WizardData to backend CreateMasterRecipeInput
   */
  static toCreateMasterRecipeInput(
    wizardData: WizardDataInput,
    itemLookupMap?: Map<string, { id: string; name: string }>
  ): CreateMasterRecipeInput {
    // Convert parameters from object format to array format
    const parameters: RecipeParameterInput[] = [];

    if (wizardData.parameters.highWineProof !== undefined) {
      parameters.push({
        name: "High Wine Proof",
        value: wizardData.parameters.highWineProof,
        unit: "proof",
        description: "Target proof for high wine distillation",
      });
    }

    if (wizardData.parameters.lowWineProof !== undefined) {
      parameters.push({
        name: "Low Wine Proof",
        value: wizardData.parameters.lowWineProof,
        unit: "proof",
        description: "Target proof for low wine distillation",
      });
    }

    if (wizardData.parameters.mashRatio !== undefined) {
      parameters.push({
        name: "Mash Ratio",
        value: wizardData.parameters.mashRatio,
        unit: "ratio",
        description: "Water to grain ratio",
      });
    }

    if (wizardData.parameters.fermentationTime !== undefined) {
      parameters.push({
        name: "Fermentation Time",
        value: wizardData.parameters.fermentationTime,
        unit: "hours",
        description: "Total fermentation time",
      });
    }

    // Parse additional parameters if provided
    if (wizardData.parameters.additionalParameters) {
      try {
        const additionalParams = JSON.parse(
          wizardData.parameters.additionalParameters
        );
        Object.entries(additionalParams).forEach(([key, value]) => {
          if (typeof value === "number") {
            parameters.push({
              name: key,
              value: value,
              unit: "",
              description: `Custom parameter: ${key}`,
            });
          }
        });
      } catch (error) {
        console.warn("Failed to parse additional parameters:", error);
      }
    }

    // Convert ingredients from frontend format to backend format
    const ingredients: RecipeIngredientInput[] = wizardData.bom.ingredients.map(
      (ingredient, index) => {
        const itemId =
          itemLookupMap?.get(ingredient.itemCode)?.id ||
          `generated_${ingredient.itemCode}_${index}`;
        const itemName =
          itemLookupMap?.get(ingredient.itemCode)?.name || ingredient.itemCode;

        return {
          id: itemId,
          itemCode: ingredient.itemCode,
          name: itemName,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          category: ingredient.category,
          notes: `Ingredient for ${wizardData.details.Recipe}`,
        };
      }
    );

    // Convert mashing steps from frontend format to backend format
    const mashingSteps: MashingStepInput[] = wizardData.mashing.steps.map(
      (step, index) => ({
        id: `step_${wizardData.details.Recipe}_${index + 1}`,
        index: step.index,
        stepType: step.stepType,
        holdType: step.holdType,
        heatTempSp: step.temperatureSP,
        coolTempSp: undefined, // Frontend doesn't have coolTempSp
        timeDuration: step.timeDuration,
        waterBacksetSP: step.waterBacksetSP,
        additiveType: step.additiveType,
        included: step.included,
        notes: step.notes,
      })
    );

    // Map whiskey type string to enum
    const whiskeyTypeEnum = this.mapWhiskeyTypeToEnum(
      wizardData.details.whiskeyType
    );

    return {
      Recipe: wizardData.details.Recipe,
      active: wizardData.active ?? true,
      whiskeyType: whiskeyTypeEnum,
      revision: wizardData.revision || "1",
      customerCode: wizardData.details.customerCode,
      cooksPerFerm: wizardData.details.cooksPerFerm,
      createdBy: wizardData.createdBy,
      mashBill: wizardData.details.mashBill,
      ingredients,
      parameters,
      mashingSteps,
    };
  }

  /**
   * Convert backend MasterRecipeResponse to frontend WizardData format
   */
  static fromMasterRecipeResponse(
    recipe: any, // MasterRecipeResponse with related data
    includeRelatedData: boolean = true
  ): Partial<WizardDataInput> {
    const wizardData: Partial<WizardDataInput> = {
      details: {
        Recipe: recipe.Recipe,
        whiskeyType: recipe.whiskeyType,
        customerCode: recipe.customerCode || "",
        cooksPerFerm: recipe.cooksPerFerm || 1,
        mashBill: recipe.mashBill || {
          corn: 0,
          rye: 0,
          wheat: 0,
          maltedBarley: 0,
        },
      },
      createdBy: recipe.createdBy,
      revision: recipe.revision?.toString() || "1",
      active: recipe.active,
    };

    if (includeRelatedData && recipe.ingredients) {
      wizardData.bom = {
        ingredients: recipe.ingredients.map((ingredient: any) => ({
          itemCode: ingredient.itemCode,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          category: ingredient.category,
        })),
      };
    }

    if (includeRelatedData && recipe.parameters) {
      const parametersObj: any = {};

      recipe.parameters.forEach((param: any) => {
        switch (param.name) {
          case "High Wine Proof":
            parametersObj.highWineProof = param.value;
            break;
          case "Low Wine Proof":
            parametersObj.lowWineProof = param.value;
            break;
          case "Mash Ratio":
            parametersObj.mashRatio = param.value;
            break;
          case "Fermentation Time":
            parametersObj.fermentationTime = param.value;
            break;
          default:
            // Handle additional parameters
            if (!parametersObj.additionalParameters) {
              parametersObj.additionalParameters = {};
            }
            parametersObj.additionalParameters[param.name] = param.value;
        }
      });

      // Convert additional parameters to JSON string
      if (parametersObj.additionalParameters) {
        parametersObj.additionalParameters = JSON.stringify(
          parametersObj.additionalParameters
        );
      }

      wizardData.parameters = parametersObj;
    }

    if (includeRelatedData && recipe.mashingSteps) {
      wizardData.mashing = {
        steps: recipe.mashingSteps.map((step: any) => ({
          index: step.index,
          stepType: step.stepType,
          holdType: step.holdType,
          temperatureSP: step.heatTempSp || step.temperatureSP,
          timeDuration: step.timeDuration,
          waterBacksetSP: step.waterBacksetSP,
          additiveType: step.additiveType,
          included: step.included,
          notes: step.notes,
        })),
      };
    }

    return wizardData;
  }

  /**
   * Map frontend whiskey type string to backend enum
   */
  private static mapWhiskeyTypeToEnum(whiskeyType: string): WhiskeyType {
    const typeMap: Record<string, WhiskeyType> = {
      FourGrainBourbon: WhiskeyType.FourGrainBourbon,
      RyeWhiskey: WhiskeyType.RyeWhiskey,
      WheatWhiskey: WhiskeyType.WheatWhiskey,
      CornWhiskey: WhiskeyType.CornWhiskey,
      MaltWhiskey: WhiskeyType.MaltWhiskey,
      // Handle variations
      "Four Grain Bourbon": WhiskeyType.FourGrainBourbon,
      "Rye Whiskey": WhiskeyType.RyeWhiskey,
      "Wheat Whiskey": WhiskeyType.WheatWhiskey,
      "Corn Whiskey": WhiskeyType.CornWhiskey,
      "Malt Whiskey": WhiskeyType.MaltWhiskey,
    };

    return typeMap[whiskeyType] || WhiskeyType.FourGrainBourbon;
  }

  /**
   * Validate that mash bill percentages add up to 100
   */
  static validateMashBill(mashBill: MashBillComposition): boolean {
    const total =
      mashBill.corn + mashBill.rye + mashBill.wheat + mashBill.maltedBarley;
    return Math.abs(total - 100) < 0.01; // Allow for small floating point errors
  }

  /**
   * Generate a recipe name from components if not provided
   */
  static generateRecipeName(
    customerCode: string,
    mashBill: MashBillComposition,
    revision: string = "1"
  ): string {
    const corn = Math.round(mashBill.corn);
    const rye = Math.round(mashBill.rye);
    const wheat = Math.round(mashBill.wheat);
    const malt = Math.round(mashBill.maltedBarley);

    return `${customerCode}-${corn.toString().padStart(2, "0")}-${rye
      .toString()
      .padStart(2, "0")}-${wheat.toString().padStart(2, "0")}-${malt
      .toString()
      .padStart(2, "0")}-v${revision.padStart(2, "0")}`;
  }
}
