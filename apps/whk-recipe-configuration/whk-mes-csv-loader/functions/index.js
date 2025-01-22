import { faker } from "@faker-js/faker";

const addPOSTFIX = (postfix, addToThis) => {
  return addToThis + postfix;
};

const spaceToDash = (spacedString) => {
  return spacedString.replace(/ /g, "-");
};

const addPOSTFIXandSpaceToDash = (postfix, addToThis) => {
  return spaceToDash(addPOSTFIX(postfix, addToThis));
};

const getOrCreateRecipe = async (
  recipeName,
  customerName,
  createdBy = "Micheal Palliparambil",
  prisma
) => {
  if (!recipeName) return undefined;

  const customerRelation = await getOrCreateCustomer(
    customerName,
    createdBy,
    prisma
  );

  const existingRecipe = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
  });

  if (existingRecipe) {
    return { connect: { id: existingRecipe.id } };
  }

  // If not found, create a new recipe and return its ID
  const newRecipe = await prisma.recipe.create({
    data: { Recipe: recipeName, createdBy, customer: customerRelation },
  });

  return { connect: { id: newRecipe.id } };
};

function adjustLotNumber(lotNumber, barrelType) {
  // Check if the lot number already contains a dot and has the correct format
  if (lotNumber && /\.\d{2}$/.test(lotNumber)) {
    return lotNumber; // Return as is if already correct
  }

  // Determine the postfix based on the barrel type
  const postfix =
    barrelType === "WVBC" ? ".01" : barrelType === "ISC" ? ".10" : ".99"; // Default to .07 if neither WVBC nor ISC

  // Append the postfix if the lot number doesn't already have it
  return lotNumber && postfix ? `${lotNumber}${postfix}` : lotNumber;
}

async function createItemID(createdBy = "system", prisma) {
  try {
    const newItem = await prisma.item.create({
      data: {
        id: faker.datatype.uuid(), // Generate a unique item ID
        itemName: faker.commerce.productName(), // Generate a random product name
        itemNumber: faker.datatype.uuid(), // Generate a unique item number
        itemType: faker.commerce.productMaterial(), // Generate a random material type
        erpId: faker.datatype.uuid(), // Generate a unique ERP ID
        createdBy: createdBy,
        itemDescription: faker.commerce.productDescription(), // Optional item description
      },
    });

    console.log("Item created successful🔥🔥🔥", String(newItem.id));
    return String(newItem.id);
  } catch (error) {
    console.error("Error creating item:", error);
    throw new Error("Failed to create item");
  }
}

const getOrCreateCustomer = async (
  customerName = "Default Customer",
  createdBy = "system",
  prisma
) => {
  const customerToUse = customerName || "Default Customer";

  // Find an existing customer by name
  const existingCustomer = await prisma.customer.findFirst({
    where: {
      name: customerToUse,
    },
  });

  if (existingCustomer) {
    return { id: existingCustomer.id }; // Return the ID directly
  }

  // Create a new customer if not found
  const newCustomer = await prisma.customer.create({
    data: {
      name: customerToUse,
      address: "Default Address", // Provide a default address
      createdBy,
      revision: 1,
    },
  });

  return { id: newCustomer.id }; // Return the ID directly
};

const findRelatedIdsByRecipe = async (
  recipeName,
  prisma,
  createdBy = "system",
  customerName = "Default Customer"
) => {
  if (!recipeName) return {};

  // Step 1: Get or create the customer
  const customer = await getOrCreateCustomer(customerName, createdBy, prisma);

  // Step 2: Find or create the recipe using the recipe name
  let recipe = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
  });

  if (!recipe) {
    console.warn(`Recipe not found: ${recipeName}. Creating a new recipe.`);

    // Create the associated item
    const item = await prisma.item.create({
      data: {
        id: faker.datatype.uuid(), // Generate a unique item ID
        itemName: `${recipeName}-ITEM`, // Provide value for itemName
        itemNumber: faker.datatype.uuid(), // Generate a unique item number
        itemType: "defaultType", // Provide a default value for itemType
        erpId: faker.datatype.uuid(), // Generate a unique ERP ID
        createdBy,
      },
    });

    // Create the recipe
    recipe = await prisma.recipe.create({
      data: {
        Recipe: recipeName,
        createdBy,
        customer: { connect: { id: customer.id } }, // Connect to the customer using its ID
        item: { connect: { id: item.id } }, // Connect to the item using its ID
      },
    });
  }

  console.log("🚀 ~ recipe:", recipe);
  const recipeId = recipe.id;

  const ensureBomExists = async (prisma) => {
    let bom = await prisma.bom.findFirst({
      where: { bomName: "Default BOM" },
    });
    if (!bom) {
      console.warn("Default BOM not found. Creating a new BOM.");

      // Create the BOM with all required fields
      bom = await prisma.bom.create({
        data: {
          bomName: "Default BOM",
          bomRevision: "1.0", // Default revision
          createdBy: "system",
          effectiveStartDate: new Date(), // Use current date
          item: {
            create: {
              id: faker.datatype.uuid(), // Generate unique item ID
              itemName: "Default Item Name",
              itemNumber: faker.datatype.uuid(), // Generate unique item number
              itemType: "defaultType",
              erpId: faker.datatype.uuid(), // Generate unique ERP ID
              createdBy: "system",
            },
          },
          bomType: "defaultType", // Optional field
          className: "defaultClass", // Optional field
          notes: "Default BOM created by system", // Optional notes
          schemaVersion: "0001-alpha", // Default schema version
          inactive: false, // Set to active by default
        },
      });
    }

    return bom;
  };

  const bom = await ensureBomExists(prisma);

  // Step 3: Find or create the production order using the recipe ID
  let productionOrder = await prisma.productionOrder.findFirst({
    where: { recipeId },
  });

  if (!productionOrder) {
    console.warn(
      `Production order not found for recipe ID: ${recipeId}. Creating a new production order.`
    );
    productionOrder = await prisma.productionOrder.create({
      data: {
        recipe: { connect: { id: recipeId } },
        status: "Initiated",
        createdBy,
        bom: { connect: { id: bom.id } },

        customer: { connect: { id: customer.id } },
        item: { connect: { id: recipe.itemId } },
      },
    });
  }

  return {
    recipeId,
    itemId: recipe.item?.id || null, // Retrieve the connected item ID
    productionOrderId: productionOrder.id || null,
  };
};
export {
  addPOSTFIXandSpaceToDash,
  adjustLotNumber,
  findRelatedIdsByRecipe,
  getOrCreateCustomer,
  getOrCreateRecipe,
};
