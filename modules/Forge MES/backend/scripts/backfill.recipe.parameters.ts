import {
  PrismaClient,
  EnumRecipeParameterRecipeSetpointType,
} from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(
      "Starting backfill of recipe parameters: SetTemp=70, ControlTemp=88"
    );

    // Find class definitions for SetTemp and ControlTemp
    const setTempClass = await prisma.recipeParameter.findFirst({
      where: { recipeParamName: "SetTemp", isClassDefinition: true },
    });
    const controlTempClass = await prisma.recipeParameter.findFirst({
      where: { recipeParamName: "ControlTemp", isClassDefinition: true },
    });

    if (!setTempClass) {
      console.warn(
        "No class definition found for SetTemp. Skipping SetTemp backfill."
      );
    }
    if (!controlTempClass) {
      console.warn(
        "No class definition found for ControlTemp. Skipping ControlTemp backfill."
      );
    }

    const recipes = await prisma.recipe.findMany({
      select: { id: true, Recipe: true },
    });
    console.log(`Found ${recipes.length} recipes to evaluate.`);

    let createdCount = 0;

    for (const recipe of recipes) {
      // For each parameter, only create if an instance is not already connected to this recipe
      if (setTempClass) {
        const existingSetTemp = await prisma.recipeParameter.findFirst({
          where: {
            recipeParamName: "SetTemp",
            isClassDefinition: false,
            recipe: { some: { id: recipe.id } },
          },
        });
        if (!existingSetTemp) {
          await prisma.recipeParameter.create({
            data: {
              className: setTempClass.className,
              recipeParamName: "SetTemp",
              recipeNumericalSetpoint: 70,
              recipeSetpointBooleanValue: false,
              description:
                setTempClass.description ??
                setTempClass.recipeParamDescription ??
                "Set Temp",
              isClassDefinition: false,
              recipeSetpointType:
                setTempClass.recipeSetpointType ??
                EnumRecipeParameterRecipeSetpointType.Numeric,
              createdBy: "backfill-script",
              recipe: { connect: { id: recipe.id } },
            },
          });
          createdCount++;
        }
      }

      if (controlTempClass) {
        const existingControlTemp = await prisma.recipeParameter.findFirst({
          where: {
            recipeParamName: "ControlTemp",
            isClassDefinition: false,
            recipe: { some: { id: recipe.id } },
          },
        });
        if (!existingControlTemp) {
          await prisma.recipeParameter.create({
            data: {
              className: controlTempClass.className,
              recipeParamName: "ControlTemp",
              recipeNumericalSetpoint: 88,
              recipeSetpointBooleanValue: false,
              description:
                controlTempClass.description ??
                controlTempClass.recipeParamDescription ??
                "Control Temp",
              isClassDefinition: false,
              recipeSetpointType:
                controlTempClass.recipeSetpointType ??
                EnumRecipeParameterRecipeSetpointType.Numeric,
              createdBy: "backfill-script",
              recipe: { connect: { id: recipe.id } },
            },
          });
          createdCount++;
        }
      }
    }

    console.log(
      `Backfill complete. Created ${createdCount} parameter instances.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
