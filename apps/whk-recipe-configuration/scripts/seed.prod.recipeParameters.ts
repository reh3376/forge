import { PrismaClient, EnumPhaseParameterSetpointType, EnumPhaseParameterStaticName, EnumRecipeParameterRecipeSetpointType } from "@prisma/client";

async function seedRecipeParameters() {
  const prisma = new PrismaClient();

  const recipeParameters = [
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "Age",
      description: "Fermentation Age",
      recipeParamUnits: "Hours",
      recipeSetpointUpperLimit: 72,
      recipeSetpointLowerLimit: 72,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Fermentation/Parameter",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "ControlTemp",
      description: "Fermentation Control recipeSetpoint",
      recipeParamUnits: "°F",
      recipeSetpointUpperLimit: 92,
      recipeSetpointLowerLimit: 92,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Fermentation/Parameter",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "CooksPerFerm",
      description: "Cooks Per Fermenter",
      recipeParamUnits: "Cooks/Ferm",
      recipeSetpointUpperLimit: 3,
      recipeSetpointLowerLimit: 3,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Mashing/Parameter",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "LowTempInfusion",
      description: "Boolean for Low Temp Infusion Enable",
      recipeParamUnits: "",
      recipeSetpointUpperLimit: 0,
      recipeSetpointLowerLimit: 0,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Mashing/Parameter",
    },
    {
      active: false,
      isClassDefinition: false,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "MashpH",
      description: "Mashing pH",
      recipeParamUnits: "pH",
      recipeSetpointUpperLimit: 5.1,
      recipeSetpointLowerLimit: 5.1,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "MashRatio",
      description: "Total Liquid  / Total Grain Weight [gal / lbs]",
      recipeParamUnits: "gal / lbs",
      recipeSetpointUpperLimit: 2.46,
      recipeSetpointLowerLimit: 2.46,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Mashing/Metric",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "RatioByFerm",
      description: "(Total Liquid + (Top Off Volume * Top Off Freq)) / (Total Grain Weight)",
      recipeParamUnits: "BGs",
      recipeSetpointUpperLimit: 2.42,
      recipeSetpointLowerLimit: 2.42,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Fermentation/Metric",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "SetTemp",
      description: "Mash Cooler Into Ferm Temp °F",
      recipeParamUnits: "°F",
      recipeSetpointUpperLimit: 90,
      recipeSetpointLowerLimit: 90,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Fermentation/Parameter",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "TopOffFrequency",
      description: "",
      recipeParamUnits: "No. of Cooks",
      recipeSetpointUpperLimit: 3,
      recipeSetpointLowerLimit: 3,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Mashing/Parameter",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "TopOffVolume",
      description: "",
      recipeParamUnits: "gal",
      recipeSetpointUpperLimit: 1000,
      recipeSetpointLowerLimit: 1000,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Mashing/Parameter",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "StarterSweetpH",
      description: "Sweet Mash Only [pH]",
      recipeParamUnits: "pH",
      recipeSetpointUpperLimit: 5.1,
      recipeSetpointLowerLimit: 5.1,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Fermentation/Parameter",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "BeerFeedTray",
      description: "Still Beer Feed Tray Number",
      recipeParamUnits: "Tray No.",
      recipeSetpointUpperLimit: 15,
      recipeSetpointLowerLimit: 15,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Distillation/Parameter",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "LowWineProof",
      description: "Low Wine Proof Actual",
      recipeParamUnits: "Proof",
      recipeSetpointUpperLimit: 130,
      recipeSetpointLowerLimit: 130,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Distillation/Actual",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "HighWineProof",
      description: "High Wine Proof Actual",
      recipeParamUnits: "Proof",
      recipeSetpointUpperLimit: 140,
      recipeSetpointLowerLimit: 140,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Distillation/Actual",
    },
    {
      active: true,
      isClassDefinition: true,
      createdAt: new Date(),
      createdBy: "pmannion@whiskeyhouse.com",
      recipeParamName: "BaseLoss",
      description: "",
      recipeParamUnits: "%ABV",
      recipeSetpointUpperLimit: 0,
      recipeSetpointLowerLimit: 0,
      revision: 0,
      recipeSetpointType: EnumRecipeParameterRecipeSetpointType.Numeric,
      className: "Distillation/Metric",
    },
  ];

  for (const param of recipeParameters) {
    await prisma.recipeParameter.create({
      data: param,
    });
  }

  console.log("Class DefRecipe parameters seeded successfully");

  // Create instances of recipe parameters and link them to class definitions and recipes
  const recipes = await prisma.recipe.findMany({
    where: {
      Recipe: {
        in: ['WHK-74-18-00-08-ISC-53-06-04-0-0-00-125'] // Add other recipe names if needed
      }
    }
  });

  for (const recipe of recipes) {
    for (const classDefParam of recipeParameters) {
      const instanceParam = {
        ...classDefParam,
        isClassDefinition: false,
        recipe: { connect: { id: recipe.id } }
      };

      await prisma.recipeParameter.create({
        data: instanceParam,
      });
    }
    console.log(`Instance recipe parameters created and linked for recipe: ${recipe.Recipe}`);
  }

  console.log("Recipe parameter instances created and linked successfully");

  await prisma.$disconnect();
}

seedRecipeParameters().catch((e) => {
  console.error(e);
  process.exit(1);
});
