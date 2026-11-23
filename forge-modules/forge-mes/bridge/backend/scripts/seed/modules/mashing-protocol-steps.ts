import {
  PrismaClient,
  EnumMashingProtocolStepHoldType,
  EnumMashingProtocolStepStepType,
} from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const mashingProtocolStepsModule: SeedModule = {
  name: "mashing-protocol-steps",
  description:
    "Mashing protocol steps with FK links to mashing protocols (auto-seeded with recipes)",
  dependencies: ["mashing-protocols"],
  priority: SEED_PRIORITIES.RECIPES,
  enabled: true,

  runner: async (
    client: PrismaClient,
    config: SeedConfig
  ): Promise<SeedResult> => {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      console.log("  └─ Seeding mashing protocol steps...");

      // Check existing mashing protocol steps
      const existingCount = await client.mashingProtocolStep.count();
      if (existingCount > 0 && config.skipExistingData) {
        console.log(
          `    Found ${existingCount} existing mashing protocol steps, skipping`
        );
        return {
          success: true,
          message: `Skipped - ${existingCount} mashing protocol steps already exist`,
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (existingCount === 0) {
        // Get required FKs
        const mashingProtocols = await client.mashingProtocol.findMany({
          where: { master: true, isTemplate: true },
        });
        if (mashingProtocols.length === 0) {
          errors.push("No master mashing protocols found");
          throw new Error("Required master mashing protocols not found");
        }

        // Create protocol steps for each master protocol
        const standardProtocol = mashingProtocols.find(
          (p) => p.name === "Standard-Bourbon-Mashing"
        );
        const ryeProtocol = mashingProtocols.find(
          (p) => p.name === "High-Rye-Mashing"
        );
        const wheatedProtocol = mashingProtocols.find(
          (p) => p.name === "Wheated-Bourbon-Mashing"
        );

        let totalStepsCreated = 0;

        // Standard Bourbon Mashing Steps
        if (standardProtocol) {
          const standardSteps = [
            {
              index: 1,
              stepType: EnumMashingProtocolStepStepType.Corn,
              holdType: EnumMashingProtocolStepHoldType.Heat,
              temperatureSetpoint: 160.0,
              heatTempSp: 160.0,
              stepTime: 30,
              heatEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 25.0,
              promptMessage: "Add corn to mash tun and heat to 160°F",
              mashingProtocolId: standardProtocol.id,
              createdBy: "system",
            },
            {
              index: 2,
              stepType: EnumMashingProtocolStepStepType.Wheat,
              holdType: EnumMashingProtocolStepHoldType.Hold,
              temperatureSetpoint: 152.0,
              coolTempSp: 152.0,
              stepTime: 15,
              coolEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 20.0,
              promptMessage: "Cool to 152°F and add wheat",
              mashingProtocolId: standardProtocol.id,
              createdBy: "system",
            },
            {
              index: 3,
              stepType: EnumMashingProtocolStepStepType.Malt,
              holdType: EnumMashingProtocolStepHoldType.Cool,
              temperatureSetpoint: 148.0,
              coolTempSp: 148.0,
              stepTime: 60,
              coolEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 15.0,
              promptMessage: "Cool to 148°F and add malted barley",
              mashingProtocolId: standardProtocol.id,
              createdBy: "system",
            },
            {
              index: 4,
              stepType: EnumMashingProtocolStepStepType.Hold,
              holdType: EnumMashingProtocolStepHoldType.Hold,
              temperatureSetpoint: 148.0,
              stepTime: 45,
              agitatorEnabled: true,
              agitatorSpdSp: 10.0,
              promptMessage: "Hold temperature and complete conversion",
              mashingProtocolId: standardProtocol.id,
              createdBy: "system",
            },
          ];

          for (const step of standardSteps) {
            await client.mashingProtocolStep.create({ data: step });
            totalStepsCreated++;
            recordsCreated++;
          }
          console.log(
            `    Created ${standardSteps.length} steps for Standard Bourbon protocol`
          );
        }

        // High Rye Mashing Steps
        if (ryeProtocol) {
          const ryeSteps = [
            {
              index: 1,
              stepType: EnumMashingProtocolStepStepType.Corn,
              holdType: EnumMashingProtocolStepHoldType.Heat,
              temperatureSetpoint: 165.0,
              heatTempSp: 165.0,
              stepTime: 35,
              heatEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 30.0,
              promptMessage:
                "Add corn to mash tun and heat to 165°F for high rye",
              mashingProtocolId: ryeProtocol.id,
              createdBy: "system",
            },
            {
              index: 2,
              stepType: EnumMashingProtocolStepStepType.Rye,
              holdType: EnumMashingProtocolStepHoldType.Hold,
              temperatureSetpoint: 155.0,
              coolTempSp: 155.0,
              stepTime: 20,
              coolEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 25.0,
              promptMessage: "Cool to 155°F and add rye grain",
              mashingProtocolId: ryeProtocol.id,
              createdBy: "system",
            },
            {
              index: 3,
              stepType: EnumMashingProtocolStepStepType.Malt,
              holdType: EnumMashingProtocolStepHoldType.Cool,
              temperatureSetpoint: 148.0,
              coolTempSp: 148.0,
              stepTime: 50,
              coolEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 15.0,
              promptMessage: "Cool to 148°F and add malted barley",
              mashingProtocolId: ryeProtocol.id,
              createdBy: "system",
            },
            {
              index: 4,
              stepType: EnumMashingProtocolStepStepType.Hold,
              holdType: EnumMashingProtocolStepHoldType.Hold,
              temperatureSetpoint: 148.0,
              stepTime: 40,
              agitatorEnabled: true,
              agitatorSpdSp: 12.0,
              promptMessage: "Hold temperature for rye conversion",
              mashingProtocolId: ryeProtocol.id,
              createdBy: "system",
            },
          ];

          for (const step of ryeSteps) {
            await client.mashingProtocolStep.create({ data: step });
            totalStepsCreated++;
            recordsCreated++;
          }
          console.log(
            `    Created ${ryeSteps.length} steps for High Rye protocol`
          );
        }

        // Wheated Bourbon Mashing Steps
        if (wheatedProtocol) {
          const wheatedSteps = [
            {
              index: 1,
              stepType: EnumMashingProtocolStepStepType.Corn,
              holdType: EnumMashingProtocolStepHoldType.Heat,
              temperatureSetpoint: 158.0,
              heatTempSp: 158.0,
              stepTime: 25,
              heatEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 20.0,
              promptMessage: "Add corn to mash tun and heat to 158°F",
              mashingProtocolId: wheatedProtocol.id,
              createdBy: "system",
            },
            {
              index: 2,
              stepType: EnumMashingProtocolStepStepType.Wheat,
              holdType: EnumMashingProtocolStepHoldType.Hold,
              temperatureSetpoint: 150.0,
              coolTempSp: 150.0,
              stepTime: 25,
              coolEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 18.0,
              promptMessage: "Cool to 150°F and add wheat (high wheat content)",
              mashingProtocolId: wheatedProtocol.id,
              createdBy: "system",
            },
            {
              index: 3,
              stepType: EnumMashingProtocolStepStepType.Malt,
              holdType: EnumMashingProtocolStepHoldType.Cool,
              temperatureSetpoint: 146.0,
              coolTempSp: 146.0,
              stepTime: 55,
              coolEnabled: true,
              agitatorEnabled: true,
              agitatorSpdSp: 12.0,
              promptMessage: "Cool to 146°F and add malted barley",
              mashingProtocolId: wheatedProtocol.id,
              createdBy: "system",
            },
            {
              index: 4,
              stepType: EnumMashingProtocolStepStepType.Hold,
              holdType: EnumMashingProtocolStepHoldType.Hold,
              temperatureSetpoint: 146.0,
              stepTime: 50,
              agitatorEnabled: true,
              agitatorSpdSp: 8.0,
              promptMessage: "Hold temperature for wheated bourbon conversion",
              mashingProtocolId: wheatedProtocol.id,
              createdBy: "system",
            },
            {
              index: 5,
              stepType: EnumMashingProtocolStepStepType.Prompt,
              holdType: EnumMashingProtocolStepHoldType.Hold,
              temperatureSetpoint: 146.0,
              stepTime: 5,
              agitatorEnabled: false,
              promptMessage: "Check mash consistency and prepare for transfer",
              mashingProtocolId: wheatedProtocol.id,
              createdBy: "system",
            },
          ];

          for (const step of wheatedSteps) {
            await client.mashingProtocolStep.create({ data: step });
            totalStepsCreated++;
            recordsCreated++;
          }
          console.log(
            `    Created ${wheatedSteps.length} steps for Wheated Bourbon protocol`
          );
        }
      } else {
        console.log(
          `    Skipped creating mashing protocol steps - ${existingCount} already exist`
        );
      }

      return {
        success: true,
        message:
          recordsCreated > 0
            ? `Successfully created ${recordsCreated} mashing protocol steps with FK links`
            : "Skipped - mashing protocol steps already exist",
        recordsCreated,
        recordsUpdated,
        errors,
        warnings,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error in mashing protocol steps seeding";
      errors.push(errorMessage);

      return {
        success: false,
        message: errorMessage,
        recordsCreated,
        recordsUpdated,
        errors,
        warnings,
        executionTimeMs: Date.now() - startTime,
      };
    }
  },

  validator: async (client: PrismaClient): Promise<ValidationResult> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsValidated = 0;

    try {
      // Validate mashing protocol steps exist
      const stepsCount = await client.mashingProtocolStep.count();
      recordsValidated += stepsCount;

      if (stepsCount < 10) {
        errors.push(
          `Insufficient mashing protocol steps: ${stepsCount} (expected at least 10)`
        );
      }

      // Validate FK links to mashing protocols
      const stepsWithProtocols = await client.mashingProtocolStep.findMany({
        select: { mashingProtocolId: true },
      });

      const stepsWithProtocolCount = stepsWithProtocols.filter(
        (s) => s.mashingProtocolId !== null
      ).length;
      if (stepsWithProtocolCount < stepsCount) {
        errors.push(
          `${
            stepsCount - stepsWithProtocolCount
          } steps missing mashing protocol FK`
        );
      }

      // Validate step types distribution
      const stepTypeDistribution = await Promise.all([
        client.mashingProtocolStep.count({
          where: { stepType: EnumMashingProtocolStepStepType.Corn },
        }),
        client.mashingProtocolStep.count({
          where: { stepType: EnumMashingProtocolStepStepType.Wheat },
        }),
        client.mashingProtocolStep.count({
          where: { stepType: EnumMashingProtocolStepStepType.Rye },
        }),
        client.mashingProtocolStep.count({
          where: { stepType: EnumMashingProtocolStepStepType.Malt },
        }),
        client.mashingProtocolStep.count({
          where: { stepType: EnumMashingProtocolStepStepType.Hold },
        }),
        client.mashingProtocolStep.count({
          where: { stepType: EnumMashingProtocolStepStepType.GrainAdd },
        }),
      ]);

      const [
        cornSteps,
        wheatSteps,
        ryeSteps,
        maltSteps,
        holdSteps,
        grainAddSteps,
      ] = stepTypeDistribution;

      // Check for grain addition steps (either legacy types or consolidated GrainAdd)
      const totalGrainSteps =
        cornSteps + wheatSteps + ryeSteps + maltSteps + grainAddSteps;
      if (totalGrainSteps === 0) {
        errors.push(
          "No grain addition steps found (neither GrainAdd nor legacy types)"
        );
      }
      if (holdSteps === 0) {
        warnings.push("No hold steps found");
      }

      // Validate temperature setpoints are realistic
      const stepsWithTemp = await client.mashingProtocolStep.findMany({
        where: { temperatureSetpoint: { not: null } },
        select: {
          temperatureSetpoint: true,
          stepType: true,
          index: true,
        },
      });

      for (const step of stepsWithTemp) {
        const temp = step.temperatureSetpoint;
        if (temp && (temp < 100 || temp > 200)) {
          warnings.push(
            `Step ${step.index} has unrealistic temperature: ${temp}°F`
          );
        }
      }

      // Validate step sequencing (indexes should be sequential within protocols)
      const protocolSteps = await client.mashingProtocolStep.findMany({
        where: { mashingProtocolId: { not: null } },
        include: { mashingProtocol: true },
        orderBy: [{ mashingProtocolId: "asc" }, { index: "asc" }],
      });

      const protocolGroups = new Map();
      protocolSteps.forEach((step) => {
        if (!step.mashingProtocolId) return;
        if (!protocolGroups.has(step.mashingProtocolId)) {
          protocolGroups.set(step.mashingProtocolId, []);
        }
        protocolGroups.get(step.mashingProtocolId).push(step);
      });

      for (const [protocolId, steps] of protocolGroups) {
        const indexes = steps
          .map((s: any) => s.index)
          .filter((i: any) => i !== null);
        const expectedIndexes = Array.from(
          { length: indexes.length },
          (_, i) => i + 1
        );

        if (
          JSON.stringify(indexes.sort()) !== JSON.stringify(expectedIndexes)
        ) {
          warnings.push(
            `Protocol ${protocolId} has non-sequential step indexes`
          );
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        recordsValidated,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Validation failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        warnings,
        recordsValidated,
      };
    }
  },
};
