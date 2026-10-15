import { gql } from '@apollo/client';

export const GET_RECIPES_BY_CUSTOMER_MASHBILL = gql`
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
`;

export const GET_RECIPE_FOR_BASIS = gql`
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
`;

export const GET_CUSTOMERS = gql`
  query GetCustomers {
    customers {
      id
      name
      customerCode
    }
  }
`; 