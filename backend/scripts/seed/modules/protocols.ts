import { PrismaClient } from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

export const protocolsModule: SeedModule = {
  name: "protocols",
  description: "Mashing protocols and protocol steps",
  dependencies: ["core-config", "items"],
  priority: SEED_PRIORITIES.PROTOCOLS,
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
      console.log("  └─ Seeding mashing protocols...");

      const protocolsData = [
        {
          id: "protocol-rye-bourbon-001",
          protocolName: "Rye Bourbon Master Protocol",
          description:
            "High Rye Bourbon Mashing Protocol (75% Corn, 21% Rye, 4% Malt)",
          isTemplate: true,
          whiskeyType: "RyeBourbon",
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
        {
          id: "protocol-wheated-bourbon-001",
          protocolName: "Wheated Bourbon Master Protocol",
          description:
            "Wheated Bourbon Mashing Protocol (68% Corn, 16% Wheat, 16% Malt)",
          isTemplate: true,
          whiskeyType: "WheatedBourbon",
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
        {
          id: "protocol-four-grain-bourbon-001",
          protocolName: "Four Grain Bourbon Master Protocol",
          description:
            "Four Grain Bourbon Mashing Protocol (60% Corn, 20% Wheat, 10% Rye, 10% Malt)",
          isTemplate: true,
          whiskeyType: "FourGrainBourbon",
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
        {
          id: "protocol-rye-whiskey-001",
          protocolName: "Rye Whiskey Master Protocol",
          description:
            "High Rye Whiskey Mashing Protocol (51% Rye, 35% Corn, 14% Malt)",
          isTemplate: true,
          whiskeyType: "RyeWhiskey",
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
        {
          id: "protocol-wheat-whiskey-001",
          protocolName: "Wheat Whiskey Master Protocol",
          description:
            "Wheat Whiskey Mashing Protocol (51% Wheat, 35% Corn, 14% Malt)",
          isTemplate: true,
          whiskeyType: "WheatWhiskey",
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
        {
          id: "protocol-malt-whiskey-001",
          protocolName: "Malt Whiskey Master Protocol",
          description:
            "Malt Whiskey Mashing Protocol (51% Malt, 35% Corn, 14% Wheat)",
          isTemplate: true,
          whiskeyType: "MaltWhiskey",
          createdBy: "system-migration",
          updatedBy: "system-migration",
          updatedAt: new Date(),
        },
      ];

      const protocolResult = await client.mashingProtocol.createMany({
        data: protocolsData,
        skipDuplicates: true,
      });
      recordsCreated += protocolResult.count;

      console.log("  └─ Seeding protocol steps...");

      // Create detailed steps for the Rye Bourbon protocol
      const ryeBourbonProtocol = await client.mashingProtocol.findFirst({
        where: { protocolName: "Rye Bourbon Master Protocol" },
      });

      if (ryeBourbonProtocol) {
        const stepsData = [
          {
            id: "step-rye-bourbon-001",
            mashingProtocolId: ryeBourbonProtocol.id,
            stepName: "Initial Water Add",
            stepSequence: 1,
            stepType: "LiquidAdd",
            targetTemperature: 140,
            holdTime: 5,
            agitatorOn: true,
            operatorPrompt: "Add process water to mash tun. Target 140°F.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: "step-rye-bourbon-002",
            mashingProtocolId: ryeBourbonProtocol.id,
            stepName: "Corn Addition",
            stepSequence: 2,
            stepType: "GrainAdd",
            targetTemperature: 160,
            holdTime: 45,
            heatOn: true,
            agitatorOn: true,
            operatorPrompt:
              "Add corn gradually while heating to 160°F. Hold for 45 minutes.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: "step-rye-bourbon-003",
            mashingProtocolId: ryeBourbonProtocol.id,
            stepName: "Temperature Hold",
            stepSequence: 3,
            stepType: "Hold",
            targetTemperature: 160,
            holdTime: 60,
            heatOn: true,
            agitatorOn: true,
            operatorPrompt: "Hold at 160°F for starch gelatinization.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: "step-rye-bourbon-004",
            mashingProtocolId: ryeBourbonProtocol.id,
            stepName: "Cool to Rye Temperature",
            stepSequence: 4,
            stepType: "Hold",
            targetTemperature: 155,
            holdTime: 15,
            coolOn: true,
            agitatorOn: true,
            operatorPrompt: "Cool to 155°F for rye addition.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: "step-rye-bourbon-005",
            mashingProtocolId: ryeBourbonProtocol.id,
            stepName: "Rye Addition",
            stepSequence: 5,
            stepType: "GrainAdd",
            targetTemperature: 155,
            holdTime: 30,
            agitatorOn: true,
            operatorPrompt:
              "Add rye grain gradually. Hold at 155°F for 30 minutes.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: "step-rye-bourbon-006",
            mashingProtocolId: ryeBourbonProtocol.id,
            stepName: "Cool to Conversion",
            stepSequence: 6,
            stepType: "Hold",
            targetTemperature: 148,
            holdTime: 10,
            coolOn: true,
            agitatorOn: true,
            operatorPrompt: "Cool to 148°F for enzyme conversion.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: "step-rye-bourbon-007",
            mashingProtocolId: ryeBourbonProtocol.id,
            stepName: "Malt Addition",
            stepSequence: 7,
            stepType: "GrainAdd",
            targetTemperature: 148,
            holdTime: 20,
            agitatorOn: true,
            operatorPrompt:
              "Add malted barley for enzyme conversion. Hold at 148°F.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: "step-rye-bourbon-008",
            mashingProtocolId: ryeBourbonProtocol.id,
            stepName: "Final Conversion",
            stepSequence: 8,
            stepType: "Hold",
            targetTemperature: 148,
            holdTime: 90,
            agitatorOn: true,
            operatorPrompt:
              "Final starch conversion. Hold at 148°F for 90 minutes.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
        ];

        const stepsResult = await client.mashingProtocolStep.createMany({
          data: stepsData,
          skipDuplicates: true,
        });
        recordsCreated += stepsResult.count;
      }

      // Create basic steps for other protocols (abbreviated for space)
      const otherProtocols = await client.mashingProtocol.findMany({
        where: {
          protocolName: { not: "Rye Bourbon Master Protocol" },
        },
      });

      for (const protocol of otherProtocols) {
        const basicSteps = [
          {
            id: `step-${protocol.id}-001`,
            mashingProtocolId: protocol.id,
            stepName: "Water Addition",
            stepSequence: 1,
            stepType: "LiquidAdd",
            targetTemperature: 140,
            holdTime: 5,
            agitatorOn: true,
            operatorPrompt: "Add process water to mash tun.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: `step-${protocol.id}-002`,
            mashingProtocolId: protocol.id,
            stepName: "Grain Addition",
            stepSequence: 2,
            stepType: "GrainAdd",
            targetTemperature: 160,
            holdTime: 45,
            heatOn: true,
            agitatorOn: true,
            operatorPrompt: "Add primary grain while heating.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
          {
            id: `step-${protocol.id}-003`,
            mashingProtocolId: protocol.id,
            stepName: "Malt Conversion",
            stepSequence: 3,
            stepType: "GrainAdd",
            targetTemperature: 148,
            holdTime: 90,
            coolOn: true,
            agitatorOn: true,
            operatorPrompt: "Add malt for enzyme conversion.",
            createdBy: "system-migration",
            updatedAt: new Date(),
          },
        ];

        const basicStepsResult = await client.mashingProtocolStep.createMany({
          data: basicSteps,
          skipDuplicates: true,
        });
        recordsCreated += basicStepsResult.count;
      }

      return {
        success: true,
        message: "Mashing protocols and steps seeded successfully",
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
          : "Unknown error in protocols seeding";
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
      // Validate protocols exist
      const protocolsCount = await client.mashingProtocol.count();
      recordsValidated += protocolsCount;
      if (protocolsCount < 5) {
        errors.push(
          `Insufficient mashing protocols: ${protocolsCount} (expected at least 5)`
        );
      }

      // Validate protocol steps exist
      const stepsCount = await client.mashingProtocolStep.count();
      recordsValidated += stepsCount;
      if (stepsCount < 15) {
        errors.push(
          `Insufficient protocol steps: ${stepsCount} (expected at least 15)`
        );
      }

      // Validate all protocols have steps
      const protocolsWithoutSteps = await client.mashingProtocol.count({
        where: {
          mashingProtocolSteps: {
            none: {},
          },
        },
      });

      if (protocolsWithoutSteps > 0) {
        errors.push(`${protocolsWithoutSteps} protocols without steps`);
      }

      // Validate required protocols exist
      const requiredProtocols = [
        "Rye Bourbon Master Protocol",
        "Wheated Bourbon Master Protocol",
        "Rye Whiskey Master Protocol",
      ];

      for (const protocolName of requiredProtocols) {
        const protocol = await client.mashingProtocol.findFirst({
          where: { protocolName },
        });
        if (!protocol) {
          errors.push(`Required protocol not found: ${protocolName}`);
        }
      }

      // Validate step sequences are proper
      const protocolsWithSteps = await client.mashingProtocol.findMany({
        include: {
          mashingProtocolSteps: {
            orderBy: { stepSequence: "asc" },
          },
        },
      });

      for (const protocol of protocolsWithSteps) {
        const steps = protocol.mashingProtocolSteps;
        if (steps.length > 0) {
          // Check if step sequences start at 1 and are sequential
          const sequences = steps.map((step) => step.stepSequence);
          const expectedSequences = Array.from(
            { length: sequences.length },
            (_, i) => i + 1
          );

          if (JSON.stringify(sequences) !== JSON.stringify(expectedSequences)) {
            warnings.push(
              `Protocol ${protocol.protocolName} has non-sequential step numbers`
            );
          }

          // Check for reasonable temperature ranges
          const temperatures = steps
            .map((step) => step.targetTemperature)
            .filter((temp) => temp !== null);

          const unreasonableTemps = temperatures.filter(
            (temp) => temp! < 100 || temp! > 200
          );
          if (unreasonableTemps.length > 0) {
            warnings.push(
              `Protocol ${
                protocol.protocolName
              } has unusual temperatures: ${unreasonableTemps.join(", ")}°F`
            );
          }
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
