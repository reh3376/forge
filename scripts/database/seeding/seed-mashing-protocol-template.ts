import { PrismaClient } from '../../../backend/node_modules/@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Based on seed.prod.mashRecipe.GSC.00950005.ts
const MASHING_PROTOCOL_TEMPLATE = {
  name: "GSC Rye Bourbon Template 00-95-00-05",
  templateCategory: "RyeBourbon" as const,
  templateDescription: "Standard mashing protocol template for Rye Bourbon based on GSC 00-95-00-05 recipe. Includes liquid addition, grain additions, enzyme dosing, and temperature holds.",
  isTemplate: true,
  master: true,
  running: false,
  createdBy: "system@whiskeyhouse.com",
  updatedBy: "system@whiskeyhouse.com"
};

// Mashing protocol steps based on the original MASHING_PROTOCOL array
const MASHING_PROTOCOL_STEPS = [
  {
    index: 1,
    stepType: "LiquidAdd" as const,
    promptMessage: "Add Water and Backset",
    temperatureSetpoint: null,
    stepTime: null,
    holdType: null,
    heatEnabled: false,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 50.0,
    linkedItems: ["Water", "Backset"] // Will be mapped to actual item IDs
  },
  {
    index: 2,
    stepType: "Hold" as const,
    holdType: "Heat" as const,
    promptMessage: "Heat to 130°F",
    temperatureSetpoint: 130.0,
    stepTime: null,
    heatEnabled: true,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 50.0,
    linkedItems: []
  },
  {
    index: 3,
    stepType: "Malt" as const,
    promptMessage: "Add Malt",
    temperatureSetpoint: 130.0,
    stepTime: null,
    holdType: null,
    heatEnabled: false,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 60.0,
    linkedItems: ["Malt"]
  },
  {
    index: 4,
    stepType: "AdditiveAdd" as const,
    promptMessage: "Add Liquozyme enzyme",
    temperatureSetpoint: 130.0,
    stepTime: null,
    holdType: null,
    heatEnabled: false,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 60.0,
    linkedItems: ["Liquozyme"]
  },
  {
    index: 5,
    stepType: "Rye" as const,
    promptMessage: "Add Rye grain",
    temperatureSetpoint: 130.0,
    stepTime: null,
    holdType: null,
    heatEnabled: false,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 60.0,
    linkedItems: ["Rye"]
  },
  {
    index: 6,
    stepType: "Hold" as const,
    holdType: "Hold" as const,
    promptMessage: "Hold for 5 minutes",
    temperatureSetpoint: 130.0,
    stepTime: 5,
    heatEnabled: true,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 50.0,
    linkedItems: []
  },
  {
    index: 7,
    stepType: "AdditiveAdd" as const,
    promptMessage: "Add DIAZYME enzyme",
    temperatureSetpoint: 130.0,
    stepTime: null,
    holdType: null,
    heatEnabled: false,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 60.0,
    linkedItems: ["DIAZYME"]
  },
  {
    index: 8,
    stepType: "AdditiveAdd" as const,
    promptMessage: "Add Laminex enzyme",
    temperatureSetpoint: 130.0,
    stepTime: null,
    holdType: null,
    heatEnabled: false,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 60.0,
    linkedItems: ["Laminex"]
  },
  {
    index: 9,
    stepType: "Hold" as const,
    holdType: "Heat" as const,
    promptMessage: "Heat to 145°F and hold for 30 minutes",
    temperatureSetpoint: 145.0,
    stepTime: 30,
    heatEnabled: true,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 50.0,
    linkedItems: []
  },
  {
    index: 10,
    stepType: "AdditiveAdd" as const,
    promptMessage: "Add Citric Acid (optional - qty: 0 if not needed)",
    temperatureSetpoint: 145.0,
    stepTime: null,
    holdType: null,
    heatEnabled: false,
    coolEnabled: false,
    agitatorEnabled: true,
    agitatorSpdSp: 60.0,
    linkedItems: ["Citric"]
  }
];

// Item mapping for linking BOM items to steps
const ITEM_MAPPINGS = {
  "Malt": ["BRY-MNA01-Malt"],
  "Rye": ["RYE-SCO02-Rye #2", "RYE-SCO01-Malted Rye", "RYE-CGB01-Malted Rye"],
  "Liquozyme": ["ENZ-UNI04-Enzyme (Liquozyme Pro)"],
  "DIAZYME": ["ENZ-GUS02-Enzyme (DIAZYME SSF2)"],
  "Laminex": ["ENZ-GUS01-Enzyme (Laminex C2K)"],
  "Citric": ["CIT-TMP01-Citric (Citric Acid)", "ADD-CIT-01 Citric Acid"],
  "Water": [], // Water items would need to be added to the database
  "Backset": [] // Backset items would need to be added to the database
};

async function seedMashingProtocolTemplate() {
  try {
    console.log('🌱 Starting mashing protocol template seeding...');

    // Check if template already exists
    const existingTemplate = await prisma.mashingProtocol.findFirst({
      where: { name: MASHING_PROTOCOL_TEMPLATE.name },
      include: { steps: true }
    });

    if (existingTemplate) {
      console.log(`⚠️  Template "${MASHING_PROTOCOL_TEMPLATE.name}" already exists. Skipping creation.`);
      return existingTemplate.id;
    }

    console.log(`Creating mashing protocol template: ${MASHING_PROTOCOL_TEMPLATE.name}`);

    // Create the mashing protocol template
    const mashingProtocol = await prisma.mashingProtocol.create({
      data: {
        id: uuidv4(),
        name: MASHING_PROTOCOL_TEMPLATE.name,
        isTemplate: true,
        templateCategory: MASHING_PROTOCOL_TEMPLATE.templateCategory,
        templateDescription: MASHING_PROTOCOL_TEMPLATE.templateDescription,
        master: false,
        running: false,
        createdBy: MASHING_PROTOCOL_TEMPLATE.createdBy,
        updatedBy: MASHING_PROTOCOL_TEMPLATE.updatedBy,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      include: { steps: true }
    });

    console.log(`Created mashing protocol template with ID: ${mashingProtocol.id}`);

    // Create the mashing protocol steps
    const steps = [
      {
        index: 1,
        stepType: 'LiquidAdd' as const,
        promptMessage: 'Add Water and Backset',
        temperatureSetpoint: null,
        stepTime: null,
        heatEnabled: false,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        holdType: null,
        bomItems: [] // Water and backset are typically not tracked as BOM items
      },
      {
        index: 2,
        stepType: 'Hold' as const,
        holdType: 'Heat' as const,
        temperatureSetpoint: 130.0,
        stepTime: null,
        heatEnabled: true,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        promptMessage: 'Heat to 130°F',
        bomItems: []
      },
      {
        index: 3,
        stepType: 'Malt' as const,
        promptMessage: 'Add Malt',
        temperatureSetpoint: 130.0,
        stepTime: null,
        heatEnabled: false,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        holdType: null,
        bomItems: ['BRY-MNA01-Malt']
      },
      {
        index: 4,
        stepType: 'AdditiveAdd' as const,
        promptMessage: 'Add Liquozyme Enzyme',
        temperatureSetpoint: 130.0,
        stepTime: null,
        heatEnabled: false,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        holdType: null,
        bomItems: ['ENZ-UNI04-Enzyme (Liquozyme Pro)']
      },
      {
        index: 5,
        stepType: 'Rye' as const,
        promptMessage: 'Add Rye',
        temperatureSetpoint: 130.0,
        stepTime: null,
        heatEnabled: false,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        holdType: null,
        bomItems: ['RYE-SCO02-Rye #2', 'RYE-SCO01-Malted Rye', 'RYE-CGB01-Malted Rye']
      },
      {
        index: 6,
        stepType: 'Hold' as const,
        holdType: 'Hold' as const,
        temperatureSetpoint: 130.0,
        stepTime: 5,
        heatEnabled: false,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        promptMessage: 'Hold for 5 minutes',
        bomItems: []
      },
      {
        index: 7,
        stepType: 'AdditiveAdd' as const,
        promptMessage: 'Add DIAZYME Enzyme',
        temperatureSetpoint: 130.0,
        stepTime: null,
        heatEnabled: false,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        holdType: null,
        bomItems: ['ENZ-GUS02-Enzyme (DIAZYME SSF2)']
      },
      {
        index: 8,
        stepType: 'AdditiveAdd' as const,
        promptMessage: 'Add Laminex Enzyme',
        temperatureSetpoint: 130.0,
        stepTime: null,
        heatEnabled: false,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        holdType: null,
        bomItems: ['ENZ-GUS01-Enzyme (Laminex C2K)']
      },
      {
        index: 9,
        stepType: 'Hold' as const,
        holdType: 'Heat' as const,
        temperatureSetpoint: 145.0,
        stepTime: 30,
        heatEnabled: true,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        promptMessage: 'Heat to 145°F and hold for 30 minutes',
        bomItems: []
      },
      {
        index: 10,
        stepType: 'AdditiveAdd' as const,
        promptMessage: 'Add Citric Acid (Optional)',
        temperatureSetpoint: 145.0,
        stepTime: null,
        heatEnabled: false,
        coolEnabled: false,
        agitatorEnabled: true,
        agitatorSpdSp: 50.0,
        holdType: null,
        bomItems: ['ADD-CIT-01 Citric Acid', 'CIT-TMP01-Citric (Citric Acid)']
      }
    ];

    // Get all available items that we might need to link
    const availableItems = await prisma.item.findMany({
      where: {
        itemNumber: {
          in: [
            'BRY-MNA01-Malt',
            'ENZ-UNI04-Enzyme (Liquozyme Pro)',
            'RYE-SCO02-Rye #2',
            'RYE-SCO01-Malted Rye', 
            'RYE-CGB01-Malted Rye',
            'ENZ-GUS02-Enzyme (DIAZYME SSF2)',
            'ENZ-GUS01-Enzyme (Laminex C2K)',
            'ADD-CIT-01 Citric Acid',
            'CIT-TMP01-Citric (Citric Acid)'
          ]
        }
      }
    });

    console.log(`Found ${availableItems.length} available items for linking`);

    // Create a map of item numbers to item IDs
    const itemMap = new Map(availableItems.map(item => [item.itemNumber, item.id]));

    // Create the steps and link BOM items
    for (const stepData of steps) {
      console.log(`Creating step ${stepData.index}: ${stepData.promptMessage}`);
      
      const step = await prisma.mashingProtocolStep.create({
        data: {
          id: uuidv4(),
          mashingProtocolId: mashingProtocol.id,
          index: stepData.index,
          stepType: stepData.stepType,
          holdType: stepData.holdType,
          temperatureSetpoint: stepData.temperatureSetpoint,
          stepTime: stepData.stepTime,
          heatEnabled: stepData.heatEnabled,
          coolEnabled: stepData.coolEnabled,
          agitatorEnabled: stepData.agitatorEnabled,
          agitatorSpdSp: stepData.agitatorSpdSp,
          promptMessage: stepData.promptMessage,
          createdBy: 'system',
          updatedAt: new Date(),
        }
      });

      // Link BOM items to this step if any are specified
      if (stepData.bomItems.length > 0) {
        for (const itemNumber of stepData.bomItems) {
          const itemId = itemMap.get(itemNumber);
          if (itemId) {
            // First, we need to find or create a RecipeBomItem for this item
            // For now, we'll create a placeholder RecipeBomItem
            const recipeBomItem = await prisma.recipeBomItem.create({
              data: {
                id: uuidv4(),
                itemId: itemId,
                operation: 'Mashing01',
                quantity: 1.0, // Placeholder quantity
                createdBy: 'system',
                updatedAt: new Date(),
              }
            });

            // Link the step to the BOM item via the relationship table
            await prisma.$executeRaw`
              INSERT INTO "_MashingProtocolStepToRecipeBomItem" ("A", "B") 
              VALUES (${step.id}, ${recipeBomItem.id})
              ON CONFLICT DO NOTHING
            `;
            
            console.log(`  - Linked item: ${itemNumber}`);
          } else {
            console.log(`  - Warning: Item not found: ${itemNumber}`);
          }
        }
      }
    }

    console.log(`Successfully created mashing protocol template with ${steps.length} steps`);
    
    // Fetch and return the complete template with steps
    const completeTemplate = await prisma.mashingProtocol.findUnique({
      where: { id: mashingProtocol.id },
      include: { steps: true }
    });

    return completeTemplate!.id;

  } catch (error) {
    console.error('❌ Error seeding mashing protocol template:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Additional utility function to create a recipe-specific mashing protocol from template
export async function createMashingProtocolFromTemplate(
  templateId: string,
  recipeName: string,
  createdBy: string
) {
  try {
    // Find the template with its steps
    const template = await prisma.mashingProtocol.findUnique({
      where: { id: templateId },
      include: { steps: true }
    });

    if (!template) {
      throw new Error(`Template with ID ${templateId} not found`);
    }

    if (!template.isTemplate) {
      throw new Error(`Protocol with ID ${templateId} is not a template`);
    }

    console.log(`Creating mashing protocol "${recipeName}" from template "${template.name}"`);

    // Create new protocol based on template
    const newProtocol = await prisma.mashingProtocol.create({
      data: {
        id: uuidv4(),
        name: recipeName,
        isTemplate: false,
        templateCategory: template.templateCategory,
        templateDescription: `Created from template: ${template.name}`,
        master: false,
        running: false,
        masterMashingProtocolId: templateId,
        createdBy: createdBy,
        updatedAt: new Date(),
      }
    });

    // Copy steps from template
    for (const templateStep of template.steps) {
      await prisma.mashingProtocolStep.create({
        data: {
          id: uuidv4(),
          mashingProtocolId: newProtocol.id,
          index: templateStep.index,
          stepType: templateStep.stepType,
          holdType: templateStep.holdType,
          temperatureSetpoint: templateStep.temperatureSetpoint,
          stepTime: templateStep.stepTime,
          heatEnabled: templateStep.heatEnabled,
          coolEnabled: templateStep.coolEnabled,
          agitatorEnabled: templateStep.agitatorEnabled,
          agitatorSpdSp: templateStep.agitatorSpdSp,
          promptMessage: templateStep.promptMessage,
          createdBy: createdBy,
          updatedAt: new Date(),
        }
      });
    }

    console.log(`Successfully created protocol "${recipeName}" with ${template.steps.length} steps`);
    return newProtocol.id;

  } catch (error) {
    console.error('Error creating mashing protocol from template:', error);
    throw error;
  }
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedMashingProtocolTemplate()
    .then(() => {
      console.log('✅ Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

export default seedMashingProtocolTemplate; 