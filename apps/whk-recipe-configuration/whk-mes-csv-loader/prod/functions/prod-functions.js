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
  createdBy = "Default Production Name",
  prisma
) => {
  if (!recipeName) throw new Error("recipeName is undefined");

  console.log("🚀 ~ createdBy:", createdBy);
  if (!createdBy) throw new Error("createdBy is undefined");

  // Find the recipe to get its associated customer
  const recipeWithCustomer = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
    include: { customer: true }, // Include the customer relation
  });

  if (!recipeWithCustomer) {
    throw new Error(`Recipe not found for recipeName: ${recipeName}`);
  }

  if (!recipeWithCustomer.customer) {
    throw new Error(`Customer not associated with recipe: ${recipeName}`);
  }

  const customerId = recipeWithCustomer.customer.id;

  // Check if the recipe already exists
  const existingRecipe = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
  });

  if (existingRecipe) {
    return { connect: { id: existingRecipe.id } };
  }

  // If recipe doesn't exist, return undefined (assuming data should already exist)
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
  createdBy = "Default Production RUN User"
) => {
  console.log("🚀 ~ recipeName:", recipeName);
  if (!recipeName) throw new Error("recipeName is undefined");

  console.log("🚀 ~ createdBy:", createdBy);
  if (!createdBy) throw new Error("createdBy is undefined");

  // Step 1: Find the recipe and include customer
  const recipeWithCustomer = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
    include: { customer: true },
  });

  if (!recipeWithCustomer) {
    console.warn(`Recipe not found: ${recipeName}.`);
    return {};
  }

  const recipeId = recipeWithCustomer.id;
  const customerID = recipeWithCustomer.customer?.id;

  if (!customerID) {
    console.warn(`No customer associated with recipe: ${recipeName}.`);
    return {};
  }

  console.log("🚀 ~ customerID:", customerID);

  // Step 2: Find the production order
  let productionOrder = await prisma.productionOrder.findFirst({
    where: { recipeId },
  });

  if (!productionOrder) {
    console.warn(`Production order not found for recipe ID: ${recipeId}.`);
    return {
      recipeId,
      customerID,
      productionOrderId: null,
      itemId: null,
    };
  }

  console.log("🚀 ~ productionOrder:", productionOrder);

  // Return the related IDs
  return {
    recipeId,
    customerID,
    productionOrderId: productionOrder.id || null,
    itemId: recipeWithCustomer.item?.id || null, // Retrieve the connected item ID
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
