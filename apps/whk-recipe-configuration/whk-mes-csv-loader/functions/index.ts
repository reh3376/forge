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

const getOrCreateCustomer = async (
  customerName = "Default Customer",
  createdBy = "system",
  prisma
) => {
  // Ensure a default value is always used if customerName is undefined or null
  const customerToUse = customerName || "Default Customer";

  // Find an existing customer by name
  const existingCustomer = await prisma.customer.findFirst({
    where: { name: customerToUse },
  });

  if (existingCustomer) {
    return { connect: { id: existingCustomer.id } };
  }

  // Create a new customer if not found
  const newCustomer = await prisma.customer.create({
    data: {
      name: customerToUse,
      address: "Default Address", // Provide a default address
      createdBy, // Use the provided or default value for createdBy
    },
  });

  return { connect: { id: newCustomer.id } };
};

// Helper to find IDs by recipe
const findRelatedIdsByRecipe = async (recipeName) => {
  if (!recipeName) return {};

  const recipe = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
    include: {
      productionOrder: true, // Assuming your schema relates recipes to production orders
      container: true, // Assuming your schema relates recipes to containers
    },
  });

  if (!recipe) {
    console.warn(`Recipe not found: ${recipeName}`);
    return {};
  }

  return {
    productionOrderId: recipe.productionOrder?.id || null,
    containerId: recipe.container?.id || null,
    fgItemId: recipe.container?.itemId || null, // Assuming `itemId` is under `container`
  };
};

export {
  addPOSTFIXandSpaceToDash,
  adjustLotNumber,
  findRelatedIdsByRecipe,
  getOrCreateCustomer,
  getOrCreateRecipe,
};
