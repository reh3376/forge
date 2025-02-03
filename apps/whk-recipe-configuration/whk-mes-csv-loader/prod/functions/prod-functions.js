import { start } from "repl";

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
  
  return spacedString.replace(/(?!^) /g, "-").replace(/^ /, "");
};

const addPOSTFIXandSpaceToDash = (postfix, addToThis) => {
  return spaceToDash(addPOSTFIX(postfix, addToThis));
};

const getRecipeIfExists = async (
  recipeName,
  createdBy = "pmannion@whiskeyhouse.com",
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
  createdBy = "pmannion@whiskeyhouse.com"
) => {
  // console.log(`In the findRelatedIdsByRecipe function for recipeName: ${recipeName}`);
  console.log("🚀 ~ recipeName:", recipeName);
  if (!recipeName) throw new Error("recipeName is undefined");

  console.log("🚀 ~ createdBy:", createdBy);
  if (!createdBy) throw new Error("createdBy is undefined");

  // Step 1: Find the recipe and include customer
  let recipeWithCustomer = await prisma.recipe.findFirst({
    where: { Recipe: recipeName },
    include: { customer: true, item: true },
  });
  if (!recipeWithCustomer) {
    if (recipeName.startsWith('WHK')) {
        console.log(`Recipe not found: ${recipeName}, WHK recipe detected, creating...`);
        // Get base recipe name without -R01
        const baseRecipeName = recipeName.replace(/-R01$/, '');
        
        // Find item that starts with the base recipe name and matches proof
        const matchingItem = await prisma.item.findFirst({
          where: {
            AND: [
              {
                itemNumber: {
                  startsWith: baseRecipeName
                }
              },
            ]
          }
        });
  
        if (!matchingItem) {
          throw new Error(`No matching item found for recipe: ${recipeName}`);
        }
        // console.log(`Matching item found: ${matchingItem.id}`);

        // Get customer code from first 3 chars of recipe
        const customerCode = baseRecipeName.substring(0, 3);
        // console.log(`Customer code: ${customerCode}`);
        
        // Find customer by code
        let customer = {};
        try {
          customer = await prisma.customer.findFirst({
            where: {
              customerCode: {contains: customerCode}
            }
          });
  
          if (!customer) {
            throw new Error(`No customer found with code: ${customerCode}`);
          }
          console.log(`Customer found: ${customer.id}`);
        } catch (error) {
          console.error(`Error finding customer: ${customerCode}`, error);
          throw new Error(`Error finding customer: ${customerCode}`);
        }

        // Extract mashbill by removing customer code and replacing the first dash
        const mashbill = baseRecipeName.substring(3).replace(/-/, '').replace(/-$/, '');
        console.log(`Looking for recipe group with mashbill: ${mashbill}`);

        // Find recipe group by mashbill
        let recipeGroup = {};
        try {
          recipeGroup = await prisma.recipeGroup.findFirst({
            where: {
              recipe: mashbill
            }
          });
          if (!recipeGroup) {
            throw new Error(`No recipe group found for mashbill: ${mashbill}`);
          }
          // console.log(`Recipe group found: ${recipeGroup.id}`);
        } catch (error) {
          console.error(`Error finding recipe group: ${mashbill}`, error);
          throw new Error(`Error finding recipe group: ${mashbill}, error: ${error}`);
        }
  
        // Create new recipe record
        try {
          recipeWithCustomer = await prisma.recipe.upsert({
            where: { Recipe: recipeName },
            update: {
              createdBy: createdBy,
              item: {
                connect: {
                  id: matchingItem.id
                }
              },
              customer: {
                connect: {
                  id: customer.id
                }
              },
              customerCode: customerCode,
              revision: 1,
              recipeGroup: {
                connect: {
                  id: recipeGroup.id
                }
              }
            },
            create: {
              Recipe: recipeName,
              createdBy: createdBy,
              item: {
                connect: {
                  id: matchingItem.id
                }
              },
              customer: {
                connect: {
                  id: customer.id
                }
              },
              customerCode: customerCode,
              revision: 1,
              recipeGroup: {
                connect: {
                  id: recipeGroup.id
                }
              }
            },
            include: {
              customer: true,
              recipeGroup: true,
              item: true
            }
          });
          // console.log(`New recipe created: ${JSON.stringify(recipeWithCustomer)}`);
          // console.log(`New recipe created: ${recipeName}`);
          // return { connect: { id: recipeName } };
        } catch (error) {
          console.error(`Error creating recipe: ${recipeName}`, error);
          throw new Error(`Error creating recipe: ${recipeName}`);
        }
  
      } else {
        throw new Error(`Recipe not found for recipeName: ${recipeName}`);
      }
  }

  const recipeId = recipeWithCustomer.id;
  const customerID = recipeWithCustomer.customer?.id;

  if (!customerID) {
    console.warn(`No customer associated with recipe: ${recipeName}.`);
    return {};
  }

  // console.log("🚀 ~ customerID:", customerID);

  // Step 2: Find the production order
  let productionOrder;
  if (recipeName.startsWith("WHK")) {
    const recipeGroup = await prisma.recipeGroup.findFirst({
      where: { recipes: { some: { id: recipeId } } },
      include: { recipes: true },
    });

    if (recipeGroup) {
      productionOrder = await prisma.productionOrder.findFirst({
        where: { recipeId: { in: recipeGroup.recipes.map(r => r.id) } },
      });
    }
  } else {
    productionOrder = await prisma.productionOrder.findFirst({
      where: { recipeId },
    });
  }

  // console.log(`Item: ${JSON.stringify(recipeWithCustomer.item)}`);

  if (!productionOrder) {
    console.warn(`Production order not found for recipe ID: ${recipeId}.`);
    return {
      recipeId,
      customerID,
      productionOrderId: null,
      itemId: null,
    };
  }

  // console.log("🚀 ~ productionOrder:", productionOrder);

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
