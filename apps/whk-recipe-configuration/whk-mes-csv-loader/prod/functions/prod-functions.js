const addPOSTFIX = (postfix, addToThis) => {
  return addToThis + postfix;
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

const spaceToDash = (spacedString) => {
  return spacedString.replace(/ /g, "-");
};

const addPOSTFIXandSpaceToDash = (postfix, addToThis) => {
  return spaceToDash(addPOSTFIX(postfix, addToThis));
};

const getRecipeIfExists = async (
  recipeName,
  customerName,
  createdBy = "Default Production Name",
  prisma
) => {
  if (!recipeName) throw new Error("recipeName is undefined");

  console.log("🚀 ~ createdBy:", createdBy);
  if (!createdBy) throw new Error("createdBy is undefined");

  const customerRelation = await getCustomerIfExists(
    customerName,
    createdBy,
    prisma
  );

  // Find the existing recipe
  const existingRecipe = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
  });

  if (existingRecipe) {
    return { connect: { id: existingRecipe.id } };
  }

  // If not found, return undefined since we assume the data is already present
  return undefined;
};

async function getItemIdIfExists(createdBy = "system", prisma) {
  try {
    // Only retrieve existing item, no creation logic here
    const existingItem = await prisma.item.findFirst({
      where: {
        createdBy: createdBy,
      },
    });

    if (existingItem) {
      console.log("Item found:", existingItem.id);
      return String(existingItem.id);
    }

    console.warn("No item found for the given creator.");
    return undefined;
  } catch (error) {
    console.error("Error finding item:", error);
    throw new Error("Failed to find item");
  }
}

const getCustomerIfExists = async (customerID, createdBy, prisma) => {
  try {
    const customerToUse = customerID;
    if (!customerToUse) throw new Error("Customer is undefined");
    console.log("🚀 ~ customerToUse:", customerToUse);

    // Find an existing customer by name
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id: customerToUse,
      },
    });

    if (existingCustomer) {
      return { id: existingCustomer.id };
    }

    console.warn("No customer found with the name:", customerToUse);
    return undefined;
  } catch (error) {
    console.error("Error in getCustomerIfExists:", error);
    throw new Error("Failed to get or find customer.");
  }
};

const findRelatedIdsByRecipe = async (
  recipeName,
  prisma,
  createdBy,
  customerID
) => {
  console.log("🚀 ~ recipeName:", recipeName);
  if (!recipeName) throw new Error("recipeName is undefined");

  console.log("🚀 ~ customerID:", customerID);
  if (!customerID) throw new Error("customerID is undefined");

  console.log("🚀 ~ createdBy:", createdBy);
  if (!createdBy) throw new Error("createdBy is undefined");

  // Step 1: Get the customer
  const customer = await getCustomerIfExists(customerID, createdBy, prisma);
  if (!customer) {
    console.warn("No customer found.");
    return {};
  }

  // Step 2: Find the recipe using the recipe name
  let recipe = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
  });

  if (!recipe) {
    console.warn(`Recipe not found: ${recipeName}.`);
    return {};
  }

  console.log("🚀 ~ recipe:", recipe);
  const recipeId = recipe.id;

  // Step 4: Find the production order
  let productionOrder = await prisma.productionOrder.findFirst({
    where: { recipeId },
  });

  if (!productionOrder) {
    console.warn(`Production order not found for recipe ID: ${recipeId}.`);
    return {};
  }

  return {
    recipeId,
    itemId: recipe.item?.id || null, // Retrieve the connected item ID
    productionOrderId: productionOrder.id || null,
  };
};

/**
 * Query customer ID by recipe name
 * @param {string} recipeName
 * @param {object} prisma - Prisma client instance
 * @returns {Promise<string>} Customer ID
 */
async function getCustomerIdByRecipe(recipeName, prisma) {
  const recipe = await prisma.recipe.findUnique({
    where: { Recipe: recipeName },
    include: { customer: true },
  });

  if (!recipe || !recipe.customer) {
    throw new Error(`Customer not found for recipe: ${recipeName}`);
  }
  return recipe.customer.id;
}
export {
  addPOSTFIXandSpaceToDash,
  adjustLotNumber,
  findRelatedIdsByRecipe,
  getCustomerIdByRecipe,
  getCustomerIfExists,
  getRecipeIfExists,
};
