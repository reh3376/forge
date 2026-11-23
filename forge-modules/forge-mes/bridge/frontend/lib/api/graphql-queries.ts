import { gql } from '@apollo/client'

// Recipe Management Queries
export const RECIPE_QUERIES = {
  GET_RECIPES: gql`
    query GetRecipes($skip: Float, $take: Float, $filter: RecipeWhereInput) {
      recipes(skip: $skip, take: $take, where: $filter) {
        id
        Recipe
        active
        whiskeyType
        revision
        customerCode
        cooksPerFerm
        createdAt
        updatedAt
        createdBy
        updatedBy
        familyRevisionCount
        customer {
          id
          name
          customerCode
        }
        recipeBoms {
          id
          revision
          master
          running
          createdAt
          updatedAt
          recipeBomITem {
            id
            quantity
            operation
            createdAt
            updatedAt
            calculationMode
            formulaType
            formulaMultiplier
            customExpression
            formulaLibraryId
            expressionVariables
            expressionValidated
            item {
              id
              itemNumber
              itemName
              itemType
              itemGroup
            }
            displayUnits {
              id
              name
              abbreviation
            }
          }
        }
        parameters {
          id
          recipeParamName
          recipeParamDescription
          description
          className
          active
          required
          recipeSetpointType
          recipeNumericalSetpoint
          recipeSetpointBooleanValue
          recipeSetpointLowerLimit
          recipeSetpointUpperLimit
          revision
          createdAt
          updatedAt
          createdBy
          units {
            id
            name
            abbreviation
          }
          operation {
            id
            name
          }
        }
        mashingProtocol {
          id
          name
          isTemplate
          templateCategory
          templateDescription
          master
          running
          revision
          createdAt
          updatedAt
          createdBy
          steps {
            id
            index
            stepType
            holdType
            stepTime
            temperatureSetpoint
            temperatureActual
            heatEnabled
            heatTempSp
            coolEnabled
            coolTempSp
            agitatorEnabled
            agitatorSpdSp
            promptMessage
            createdAt
            updatedAt
            createdBy
            recipeBomItem {
              id
              item {
                id
                itemName
                itemNumber
                itemType
                itemClass
                itemGroup
              }
              quantity
              displayUnits {
                id
                name
                abbreviation
                perOperation
              }
              operation
            }
          }
        }
      }
    }
  `,

  GET_RECIPES_COUNT: gql`
    query GetRecipesCount($filter: RecipeWhereInput) {
      recipes(where: $filter, take: 1000) {
        id
      }
    }
  `,

  GET_RECIPE: gql`
    query GetRecipe($id: String!) {
      recipe(where: { id: $id }) {
        id
        Recipe
        active
        whiskeyType
        revision
        customerCode
        cooksPerFerm
        createdAt
        updatedAt
        createdBy
        updatedBy
        customer {
          id
          name
          customerCode
        }
        recipeBoms {
          id
          revision
          master
          running
          createdAt
          updatedAt
          recipeBomITem {
            id
            quantity
            operation
            createdAt
            updatedAt
            createdBy
            calculationMode
            formulaType
            formulaMultiplier
            customExpression
            formulaLibraryId
            expressionVariables
            expressionValidated
            item {
              id
              itemNumber
              itemName
            }
            displayUnits {
              id
              name
              abbreviation
              perOperation
            }
          }
        }
        parameters {
          id
          recipeParamName
          recipeParamDescription
          description
          className
          active
          required
          recipeSetpointType
          recipeNumericalSetpoint
          recipeSetpointBooleanValue
          recipeSetpointLowerLimit
          recipeSetpointUpperLimit
          revision
          createdAt
          updatedAt
          createdBy
          units {
            id
            name
            abbreviation
          }
          operation {
            id
            name
          }
        }
        mashingProtocol {
          id
          name
          isTemplate
          templateCategory
          templateDescription
          master
          running
          revision
          createdAt
          updatedAt
          createdBy
          steps {
            id
            index
            stepType
            holdType
            stepTime
            temperatureSetpoint
            temperatureActual
            heatEnabled
            heatTempSp
            coolEnabled
            coolTempSp
            agitatorEnabled
            agitatorSpdSp
            promptMessage
            createdAt
            updatedAt
            createdBy
            recipeBomItem {
              id
              item {
                id
                itemName
                itemNumber
                itemType
                itemClass
                itemGroup
              }
              quantity
              displayUnits {
                id
                name
                abbreviation
                perOperation
              }
              operation
            }
          }
        }
      }
    }
  `,

  GET_RECIPES_BY_CUSTOMER_MASHBILL: gql`
    query GetRecipesByCustomerMashBill($customerCode: String!, $mashBillPattern: String!) {
      recipes(
        where: {
          customerCode: { equals: $customerCode }
          Recipe: { contains: $mashBillPattern }
        }
        orderBy: { revision: Desc }
      ) {
        id
        Recipe
        revision
        whiskeyType
        active
        createdAt
        createdBy
        customerCode
      }
    }
  `,

  GET_FAMILY_REVISIONS: gql`
    query GetFamilyRevisions($familyPattern: String!) {
      recipes(
        where: {
          Recipe: { startsWith: $familyPattern }
        }
        orderBy: { revision: Desc }
      ) {
        id
        Recipe
        revision
        whiskeyType
        active
        createdAt
        updatedAt
        createdBy
        updatedBy
        customerCode
        cooksPerFerm
        familyRevisionCount
        customer {
          id
          name
          customerCode
        }
        recipeBoms {
          id
          revision
          master
          running
          createdAt
          updatedAt
          recipeBomITem {
            id
            quantity
            operation
            createdAt
            updatedAt
            calculationMode
            formulaType
            formulaMultiplier
            customExpression
            formulaLibraryId
            expressionVariables
            expressionValidated
            item {
              id
              itemNumber
              itemName
              itemType
              itemGroup
            }
            displayUnits {
              id
              name
              abbreviation
            }
          }
        }
        parameters {
          id
          recipeParamName
          recipeParamDescription
          description
          className
          active
          required
          recipeSetpointType
          recipeNumericalSetpoint
          recipeSetpointBooleanValue
          recipeSetpointLowerLimit
          recipeSetpointUpperLimit
          revision
          createdAt
          updatedAt
          createdBy
          units {
            id
            name
            abbreviation
          }
          operation {
            id
            name
          }
        }
        mashingProtocol {
          id
          name
          isTemplate
          templateCategory
          templateDescription
          master
          running
          revision
          createdAt
          updatedAt
          createdBy
          steps {
            id
            index
            stepType
            holdType
            stepTime
            temperatureSetpoint
            temperatureActual
            heatEnabled
            heatTempSp
            coolEnabled
            coolTempSp
            agitatorEnabled
            agitatorSpdSp
            promptMessage
            createdAt
            updatedAt
            createdBy
            recipeBomItem {
              id
              item {
                id
                itemName
                itemNumber
                itemType
                itemClass
                itemGroup
              }
              quantity
              displayUnits {
                id
                name
                abbreviation
                perOperation
              }
              operation
            }
          }
        }
      }
    }
  `,

  GET_RECIPE_FOR_BASIS: gql`
    query GetRecipeForBasis($id: String!) {
      recipe(where: { id: $id }) {
        id
        Recipe
        revision
        whiskeyType
        active
        customerCode
        cooksPerFerm
        globalId
        schemaVersion
        createdAt
        createdBy
        updatedAt
        updatedBy
        customer {
          id
          name
          customerCode
        }
        mashingProtocol {
          id
          name
          revision
          templateCategory
          templateDescription
          steps {
            id
            index
            stepType
            holdType
            stepTime
            temperatureSetpoint
            heatEnabled
            heatTempSp
            coolEnabled
            coolTempSp
            agitatorEnabled
            agitatorSpdSp
            promptMessage
            recipeBomItem {
              id
              item {
                id
                itemName
                itemNumber
                itemType
                itemClass
                itemGroup
              }
              quantity
              displayUnits {
                id
                name
                abbreviation
                perOperation
              }
              operation
            }
          }
        }
        parameters {
          id
          recipeParamName
          recipeParamDescription
          recipeNumericalSetpoint
          recipeSetpointType
          recipeSetpointBooleanValue
          recipeSetpointLowerLimit
          recipeSetpointUpperLimit
          required
          active
          operation {
            id
            name
            abbreviation
            description
          }
          units {
            id
            name
            abbreviation
          }
        }
        recipeBoms {
          id
          revision
          master
          running
          recipeBomITem {
            id
            operation
            quantity
            isClassDefinition
            calculationMode
            formulaType
            formulaMultiplier
            customExpression
            formulaLibraryId
            expressionVariables
            expressionValidated
            item {
              id
              itemName
              itemNumber
              itemDescription
              itemType
              itemClass
              itemGroup
            }
            displayUnits {
              id
              name
              abbreviation
              perOperation
            }
          }
        }
        recipeGroup {
          id
          recipe
          revision
        }
      }
    }
  `,

  GET_ACTIVE_RECIPES: gql`
    query GetActiveRecipes {
      getActiveRecipes {
        id
        Recipe
        active
        whiskeyType
        customerCode
        cooksPerFerm
        createdAt
        updatedAt
        createdBy
        customer {
          id
          name
          customerCode
        }
      }
    }
  `,

  GET_RECIPE_BOM: gql`
    query GetRecipeBom($recipeId: String!) {
      recipe(where: { id: $recipeId }) {
        id
        Recipe
        recipeBoms {
          id
          revision
          master
          running
          recipeBomITem {
            id
            quantity
            operation
            calculationMode
            formulaType
            formulaMultiplier
            customExpression
            formulaLibraryId
            expressionVariables
            expressionValidated
            item {
              id
              itemNumber
              itemName
              itemType
              itemGroup
            }
            displayUnits {
              id
              name
              abbreviation
              perOperation
            }
          }
        }
      }
    }
  `,
}

// Recipe Mutations
export const RECIPE_MUTATIONS = {
  CREATE_RECIPE: gql`
    mutation CreateRecipe($data: RecipeCreateInput!) {
      createRecipe(data: $data) {
        id
        Recipe
        active
        whiskeyType
        revision
        createdAt
        createdBy
      }
    }
  `,

  UPDATE_RECIPE: gql`
    mutation UpdateRecipe($where: RecipeWhereUniqueInput!, $data: RecipeUpdateInput!) {
      updateRecipe(where: $where, data: $data) {
        id
        Recipe
        active
        whiskeyType
        revision
        updatedAt
        updatedBy
      }
    }
  `,

  DELETE_RECIPE: gql`
    mutation DeleteRecipe($where: RecipeWhereUniqueInput!) {
      deleteRecipe(where: $where) {
        id
        Recipe
      }
    }
  `,

  CREATE_NEW_COOK: gql`
    mutation CreateNewCook($input: CreateCookInput!) {
      createNewCook(input: $input) {
        success
        message
        data
      }
    }
  `,

  GENERATE_RECIPE: gql`
    mutation GenerateRecipe($input: GenerateRecipeInput!) {
      generateRecipe(input: $input) {
        success
        message
      }
    }
  `,

  GENERATE_RECIPE_BOM: gql`
    mutation GenerateRecipeBom($input: GenerateRecipeBomInput!) {
      generateRecipeBom(input: $input) {
        id
        revision
        items {
          itemId
          itemNumber
          itemName
          quantity
          operation
        }
      }
    }
  `,
}

// RecipeBomItem Mutations (with formula configuration)
export const RECIPE_BOM_ITEM_MUTATIONS = {
  CREATE_RECIPE_BOM_ITEM_WITH_FORMULA: gql`
    mutation CreateRecipeBomItemWithFormula($data: RecipeBomItemCreateInputExtended!) {
      createRecipeBomItemWithFormula(data: $data) {
        id
        quantity
        operation
        calculationMode
        formulaType
        formulaMultiplier
        customExpression
        formulaLibraryId
        expressionVariables
        expressionValidated
        item {
          id
          itemNumber
          itemName
          itemType
          itemGroup
        }
        displayUnits {
          id
          name
          abbreviation
        }
        recipeBoms {
          id
          revision
        }
      }
    }
  `,

  UPDATE_RECIPE_BOM_ITEM_WITH_FORMULA: gql`
    mutation UpdateRecipeBomItemWithFormula($where: RecipeBomItemWhereUniqueInput!, $data: RecipeBomItemUpdateInputExtended!) {
      updateRecipeBomItemWithFormula(where: $where, data: $data) {
        id
        quantity
        operation
        calculationMode
        formulaType
        formulaMultiplier
        customExpression
        formulaLibraryId
        expressionVariables
        expressionValidated
        item {
          id
          itemNumber
          itemName
          itemType
          itemGroup
        }
        displayUnits {
          id
          name
          abbreviation
        }
      }
    }
  `,
}

// Production Order Queries
export const PRODUCTION_ORDER_QUERIES = {
  GET_PRODUCTION_ORDERS: gql`
    query GetProductionOrders($take: Float, $skip: Float, $orderBy: [ProductionOrderOrderByInput!], $where: ProductionOrderWhereInput) {
      productionOrders(take: $take, skip: $skip, orderBy: $orderBy, where: $where) {
        id
        name
        status
        startDate
        endDate
        quantity
        completedQuantity
        upperControlLimit
        lowerControlLimit
        recipe {
          id
          Recipe
          whiskeyType
        }
        customer {
          id
        }
        scheduleOrder {
          id
          status
          totalCooks
          totalFermenters
          estimatedBarrelsPerFermenter
          estimatedPGsPerBbl
          estimatedPGsPerBushel
          totalGrainWeight
        }
      }
    }
  `,

  GET_SCHEDULE_ORDERS: gql`
    query GetScheduleOrders($take: Float, $skip: Float, $orderBy: [ScheduleOrderOrderByInput!], $where: ScheduleOrderWhereInput) {
      scheduleOrders(take: $take, skip: $skip, orderBy: $orderBy, where: $where) {
        id
        name
        status
        estimatedStart
        estimatedEnd
        actualStart
        actualEnd
        totalBarrels
        totalProofGallons
        productionOrders {
          id
          name
          status
        }
      }
    }
  `,
}

// Production Order Mutations
export const PRODUCTION_ORDER_MUTATIONS = {
  CREATE_PRODUCTION_ORDER: gql`
    mutation CreateProductionOrder($data: ProductionOrderCreateInput!) {
      createProductionOrder(data: $data) {
        id
        name
        status
        startDate
        endDate
        quantity
        upperControlLimit
        lowerControlLimit
        recipe {
          id
          whiskeyType
        }
        customer {
          id
        }
      }
    }
  `,

  UPDATE_PRODUCTION_ORDER: gql`
    mutation UpdateProductionOrder($where: ProductionOrderWhereUniqueInput!, $data: ProductionOrderUpdateInput!) {
      updateProductionOrder(where: $where, data: $data) {
        id
        name
        status
        startDate
        endDate
        quantity
        completedQuantity
        upperControlLimit
        lowerControlLimit
      }
    }
  `,

  CREATE_SCHEDULE_ORDER: gql`
    mutation CreateScheduleOrder($data: ScheduleOrderCreateInput!) {
      createScheduleOrder(data: $data) {
        id
        name
        status
        estimatedStart
        estimatedEnd
        totalBarrels
        totalProofGallons
      }
    }
  `,

  UPDATE_SCHEDULE_ORDER: gql`
    mutation UpdateScheduleOrder($where: ScheduleOrderWhereUniqueInput!, $data: ScheduleOrderUpdateInput!) {
      updateScheduleOrder(where: $where, data: $data) {
        id
        name
        status
        estimatedStart
        estimatedEnd
        actualStart
        actualEnd
        totalBarrels
        totalProofGallons
      }
    }
  `,
}

// Customer Queries
export const CUSTOMER_QUERIES = {
  GET_CUSTOMERS: gql`
    query GetCustomers($take: Float, $skip: Float) {
      customers(take: $take, skip: $skip) {
        id
        name
        customerCode
      }
    }
  `,
}

// Item Queries
export const ITEM_QUERIES = {
  GET_ITEMS: gql`
    query GetItems($where: ItemWhereInput, $take: Float, $skip: Float) {
      items(where: $where, take: $take, skip: $skip) {
        id
        itemName
        itemNumber
        itemDescription
        itemType
        itemClass
        itemGroup
      }
    }
  `,

  GET_CONTAINER_ITEMS: gql`
    query GetContainerItems {
      items(where: { itemGroup: { contains: "RM-BBL" } }) {
        id
        itemName
        itemNumber
        itemGroup
        active
      }
    }
  `,

  GET_CONTAINER_ITEMS_BY_TYPE: gql`
    query GetContainerItemsByType($containerType: String!) {
      containerItemsByType(containerType: $containerType) {
        id
        itemName
        itemNumber
        itemGroup
        active
      }
    }
  `,

  VALIDATE_CONTAINER_ITEM_COMPATIBILITY: gql`
    query ValidateContainerItemCompatibility($itemId: String!, $containerType: String!) {
      validateContainerItemCompatibility(itemId: $itemId, containerType: $containerType) {
        isValid
        message
      }
    }
  `,

  GET_CONTAINER_ITEM_USAGE_STATS: gql`
    query GetContainerItemUsageStats($itemId: String!) {
      containerItemUsageStats(itemId: $itemId) {
        totalUsage
        recentUsage {
          id
          name
          createdAt
          customer {
            name
          }
        }
      }
    }
  `,
}

// Equipment Queries
export const EQUIPMENT_QUERIES = {
  GET_EQUIPMENT_STATUS: gql`
    query GetEquipmentStatus {
      equipmentStatus {
        id
        name
        type
        status
        currentBatch
        temperature
        pressure
        level
        lastUpdate
      }
    }
  `,
}

// Container Item Mutations
export const CONTAINER_ITEM_MUTATIONS = {
  CREATE_CONTAINER_ITEM: gql`
    mutation CreateContainerItem($data: ItemCreateInput!) {
      createItem(data: $data) {
        id
        itemName
        itemNumber
        itemGroup
        active
      }
    }
  `,

  UPDATE_CONTAINER_ITEM: gql`
    mutation UpdateContainerItem($where: ItemWhereUniqueInput!, $data: ItemUpdateInput!) {
      updateItem(where: $where, data: $data) {
        id
        itemName
        itemNumber
        itemGroup
        active
      }
    }
  `,

  DELETE_CONTAINER_ITEM: gql`
    mutation DeleteContainerItem($where: ItemWhereUniqueInput!) {
      deleteItem(where: $where) {
        id
        itemName
        itemNumber
      }
    }
  `,

  LINK_CONTAINER_ITEM_TO_PRODUCTION_ORDER: gql`
    mutation LinkContainerItemToProductionOrder($productionOrderId: String!, $containerItemId: String!) {
      updateProductionOrder(
        where: { id: $productionOrderId }
        data: {
          containerItem: {
            connect: { id: $containerItemId }
          }
        }
      ) {
        id
        containerItem {
          id
          itemName
          itemNumber
          itemGroup
        }
      }
    }
  `,

  UNLINK_CONTAINER_ITEM_FROM_PRODUCTION_ORDER: gql`
    mutation UnlinkContainerItemFromProductionOrder($productionOrderId: String!, $containerItemId: String!) {
      updateProductionOrder(
        where: { id: $productionOrderId }
        data: {
          containerItem: {
            disconnect: { id: $containerItemId }
          }
        }
      ) {
        id
        containerItem {
          id
          itemName
          itemNumber
          itemGroup
        }
      }
    }
  `,
}

// Equipment Mutations
export const EQUIPMENT_MUTATIONS = {
  UPDATE_EQUIPMENT_STATUS: gql`
    mutation UpdateEquipmentStatus($id: ID!, $status: EquipmentStatus!, $data: EquipmentDataInput) {
      updateEquipmentStatus(id: $id, status: $status, data: $data) {
        id
        status
        temperature
        pressure
        level
        lastUpdate
      }
    }
  `,
}

// Batch Queries
export const BATCH_QUERIES = {
  GET_BATCHES: gql`
    query GetBatches($filter: BatchFilter) {
      batches(filter: $filter) {
        id
        batchNumber
        productionOrderId
        recipeId
        status
        startDate
        endDate
        equipment {
          mashingLine
          fermenters
          distillationLine
        }
        qualityMetrics {
          alcoholContent
          phLevel
          temperature
          gravity
        }
        yields {
          mashVolume
          fermentedVolume
          distilledVolume
          proofGallons
        }
      }
    }
  `,
}

// Batch Mutations
export const BATCH_MUTATIONS = {
  CREATE_BATCH: gql`
    mutation CreateBatch($input: CreateBatchInput!) {
      createBatch(input: $input) {
        id
        batchNumber
        status
        startDate
      }
    }
  `,

  UPDATE_BATCH_STATUS: gql`
    mutation UpdateBatchStatus($id: ID!, $status: BatchStatus!) {
      updateBatchStatus(id: $id, status: $status) {
        id
        status
        endDate
      }
    }
  `,

  UPDATE_BATCH_METRICS: gql`
    mutation UpdateBatchMetrics($id: ID!, $metrics: BatchMetricsInput!) {
      updateBatchMetrics(id: $id, metrics: $metrics) {
        id
        qualityMetrics {
          alcoholContent
          phLevel
          temperature
          gravity
        }
      }
    }
  `,
}

// Scheduling Queries
export const SCHEDULING_QUERIES = {
  GET_PRODUCTION_SCHEDULE: gql`
    query GetProductionSchedule($startDate: String, $endDate: String) {
      productionSchedule(startDate: $startDate, endDate: $endDate) {
        id
        productionOrderId
        equipmentId
        startDate
        endDate
        status
        notes
      }
    }
  `,
}

// Enzyme-related queries
export const GET_ENZYME_CONFIGURATIONS = gql`
  query GetEnzymeConfigurations {
    enzymeConfigurations {
      id
      category
      dosePerMetricTon
      instructions
      active
      item {
        id
        itemName
        itemNumber
      }
    }
  }
`;

export const GET_ENZYME_ITEMS = gql`
  query GetEnzymeItems {
    items(where: { itemGroup: { contains: "ENZ" } }) {
      id
      itemName
      itemNumber
      itemDescription
      itemType
      itemClass
      itemGroup
      createdAt
      updatedAt
    }
  }
`;

export const GET_RECIPE_BOMS = gql`
  query GetRecipeBoms($recipeId: String) {
    recipeBoms(where: { recipe: { some: { id: { equals: $recipeId } } } }) {
      id
      revision
      master
      running
      recipe {
        id
        Recipe
        revision
        whiskeyType
      }
      recipeBomITem {
        id
        operation
        quantity
        isClassDefinition
        calculationMode
        formulaType
        formulaMultiplier
        customExpression
        formulaLibraryId
        expressionVariables
        expressionValidated
        item {
          id
          itemName
          itemNumber
          itemDescription
          itemType
          itemClass
          itemGroup
        }
        displayUnits {
          id
          name
          abbreviation
          perOperation
        }
      }
      createdAt
      updatedAt
    }
  }
`;

export const GET_RECIPES_WITH_BOMS = gql`
  query GetRecipesWithBoms($take: Float) {
    recipes(where: { recipeBoms: { some: {} } }, take: $take) {
      id
      Recipe
      whiskeyType
      active
      recipeBoms {
        id
        revision
        master
        running
        recipeBomITem {
          id
          quantity
          operation
          calculationMode
          formulaType
          formulaMultiplier
          customExpression
          formulaLibraryId
          expressionVariables
          expressionValidated
          item {
            id
            itemName
            itemNumber
            itemType
            itemClass
            itemGroup
          }
          displayUnits {
            id
            name
            abbreviation
          }
        }
      }
    }
  }
`;

export const GET_ENZYME_CALCULATION_HISTORY = gql`
  query GetEnzymeCalculationHistory($limit: Int, $offset: Int) {
    recipeBoms(
      take: $limit
      skip: $offset
      orderBy: { createdAt: Desc }
    ) {
      id
      recipe {
        id
        Recipe
        revision
      }
      recipeBomITem {
        id
        quantity
        item {
          id
          itemName
          itemNumber
          itemType
          itemClass
          itemGroup
        }
        displayUnits {
          id
          name
          abbreviation
          perOperation
        }
      }
      createdAt
      updatedAt
    }
  }
`;

// Enzyme dosing calculation mutation (supports both recipeId and mashBill)
export const CALCULATE_NORMALIZED_ENZYME_DOSING = gql`
  mutation CalculateNormalizedEnzymeDosing($data: CalculateNormalizedEnzymeDosingInput!) {
    calculateNormalizedEnzymeDosing(data: $data) {
      normalizedDoseRatio
      enzymeName
      mashBill
      instructions
      recipeId
      recipeName
      enzymeCategory
      calculatedAt
    }
  }
`;

// Enzyme dosing calculation with recipe ID (for edit mode)
export const CALCULATE_ENZYME_DOSING_BY_RECIPE = gql`
  mutation CalculateEnzymeDosingByRecipe($recipeId: String!, $enzymeItemId: String!) {
    calculateNormalizedEnzymeDosing(data: {
      recipeId: $recipeId
      enzymeItemId: $enzymeItemId
    }) {
      normalizedDoseRatio
      enzymeName
      mashBill
      instructions
      recipeId
      recipeName
      enzymeCategory
      calculatedAt
    }
  }
`;

// Enzyme dosing calculation with mash bill (for create mode)
export const CALCULATE_ENZYME_DOSING_BY_MASHBILL = gql`
  mutation CalculateEnzymeDosingByMashBill($mashBill: String!, $enzymeItemId: String!) {
    calculateNormalizedEnzymeDosing(data: {
      mashBill: $mashBill
      enzymeItemId: $enzymeItemId
    }) {
      normalizedDoseRatio
      enzymeName
      mashBill
      instructions
      enzymeCategory
      calculatedAt
    }
  }
`;

export const GET_RECIPES_FOR_ENZYME_DOSING = gql`
  query GetRecipesForEnzymeDosing {
    recipes(where: { active: { equals: true } }) {
      id
      Recipe
      revision
      whiskeyType
      active
      customerCode
      cooksPerFerm
      globalId
      schemaVersion
      createdAt
      updatedAt
      customer {
        id
        name
        customerCode
      }
      mashingProtocol {
        id
        name
        revision
        templateCategory
        templateDescription
        steps {
          id
          index
          stepType
          holdType
          stepTime
          temperatureSetpoint
          heatEnabled
          coolEnabled
          agitatorEnabled
          promptMessage
        }
      }
      parameters {
        id
        recipeParamName
        recipeParamDescription
        recipeNumericalSetpoint
        recipeSetpointType
        recipeSetpointBooleanValue
        required
        active
        units {
          id
          name
          abbreviation
        }
      }
    }
  }
`;

export const GET_MASHING_PROTOCOL_TEMPLATES = gql`
  query GetMashingProtocolTemplates {
    mashingProtocols(where: { isTemplate: { equals: true } }) {
      id
      name
      templateCategory
      templateDescription
      createdBy
      steps(orderBy: { index: Asc }) {
        id
        index
        stepTime
        stepType
        holdType
        heatTempSp
        coolTempSp
        temperatureSetpoint
        agitatorEnabled
        agitatorSpdSp
        recipeBomItem {
          id
          quantity
          item {
            id
            itemNumber
            itemName
          }
        }
      }
    }
  }
`;

export const ENZYME_QUERIES = {
  GET_ENZYME_CONFIGURATIONS,
  GET_ENZYME_ITEMS,
  GET_RECIPE_BOMS,
  GET_RECIPES_WITH_BOMS,
  GET_ENZYME_CALCULATION_HISTORY,
  GET_RECIPES_FOR_ENZYME_DOSING,
  GET_MASHING_PROTOCOL_TEMPLATES,
}

export const ENZYME_MUTATIONS = {
  CALCULATE_NORMALIZED_ENZYME_DOSING,
  CALCULATE_ENZYME_DOSING_BY_RECIPE,
  CALCULATE_ENZYME_DOSING_BY_MASHBILL,
}

// Grain Character Queries
export const GET_ACTIVE_GRAIN_CHARACTERS = gql`
  query GetActiveGrainCharacters {
    activeGrainCharacters
  }
`

export const GET_ALL_GRAIN_CHARACTERS = gql`
  query GetAllGrainCharacters {
    grainCharacters
  }
`

export const GET_GRAIN_CHARACTER_USAGE = gql`
  query GetGrainCharacterUsage($id: String!) {
    grainCharacterUsage(id: $id)
  }
`

export const GRAIN_CHARACTER_QUERIES = {
  GET_ACTIVE_GRAIN_CHARACTERS,
  GET_ALL_GRAIN_CHARACTERS,
  GET_GRAIN_CHARACTER_USAGE,
}

// Grain Character Mutations
export const CREATE_GRAIN_CHARACTER = gql`
  mutation CreateGrainCharacter($data: JSON!) {
    createGrainCharacter(data: $data)
  }
`

export const UPDATE_GRAIN_CHARACTER = gql`
  mutation UpdateGrainCharacter($id: String!, $data: JSON!) {
    updateGrainCharacter(id: $id, data: $data)
  }
`

export const DELETE_GRAIN_CHARACTER = gql`
  mutation DeleteGrainCharacter($id: String!) {
    deleteGrainCharacter(id: $id)
  }
`

export const SET_GRAIN_CHARACTER_ACTIVE = gql`
  mutation SetGrainCharacterActive($id: String!, $active: Boolean!) {
    setGrainCharacterActive(id: $id, active: $active)
  }
`

export const GRAIN_CHARACTER_MUTATIONS = {
  CREATE_GRAIN_CHARACTER,
  UPDATE_GRAIN_CHARACTER,
  DELETE_GRAIN_CHARACTER,
  SET_GRAIN_CHARACTER_ACTIVE,
}

// ItemGroup queries for grain character linking
export const GET_ITEM_GROUPS_FOR_LINKING = gql`
  query GetItemGroupsForLinking {
    itemGroups {
      id
      name
      grainCharacterId
    }
  }
`

export const LINK_ITEM_GROUPS_TO_GRAIN_CHARACTER = gql`
  mutation LinkItemGroupsToGrainCharacter($grainCharacterId: String!, $itemGroupIds: [String!]!) {
    linkItemGroupsToGrainCharacter(grainCharacterId: $grainCharacterId, itemGroupIds: $itemGroupIds)
  }
`

// All queries and mutations grouped for easy access
export const ALL_QUERIES = {
  ...RECIPE_QUERIES,
  ...PRODUCTION_ORDER_QUERIES,
  ...CUSTOMER_QUERIES,
  ...ITEM_QUERIES,
  ...EQUIPMENT_QUERIES,
  ...BATCH_QUERIES,
  ...SCHEDULING_QUERIES,
  ...ENZYME_QUERIES,
  ...GRAIN_CHARACTER_QUERIES,
}

export const ALL_MUTATIONS = {
  ...RECIPE_MUTATIONS,
  ...RECIPE_BOM_ITEM_MUTATIONS,
  ...PRODUCTION_ORDER_MUTATIONS,
  ...CONTAINER_ITEM_MUTATIONS,
  ...EQUIPMENT_MUTATIONS,
  ...BATCH_MUTATIONS,
  ...ENZYME_MUTATIONS,
  ...GRAIN_CHARACTER_MUTATIONS,
}

export const CREATE_AND_QUEUE_SCHEDULE_ORDER = gql`
  mutation CreateAndQueueScheduleOrder($data: CreateAndQueueScheduleOrderInput!) {
    createAndQueueScheduleOrder(data: $data) {
      id
      queueIndex
      scheduleOrder {
        id
        name
        recipeName
        status
        estimatedStart
        estimatedEnd
        totalBarrels
        totalProofGallons
        productionOrders {
          id
          name
        }
      }
    }
  }
` 