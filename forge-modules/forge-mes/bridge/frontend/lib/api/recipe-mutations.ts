import { gql } from '@apollo/client';

export const GENERATE_RECIPE = gql`
  mutation GenerateRecipe($input: GenerateRecipeInput!) {
    generateRecipe(input: $input) {
      id
      recipeName
      whiskeyType
      active
      customer {
        id
        name
      }
      parameters {
        id
        name
        value
        unit
      }
      recipeBom {
        id
        items {
          id
          item {
            id
            name
          }
          quantity
          unit
        }
      }
      mashingProtocol {
        id
        name
        steps {
          id
          stepNumber
          temperature
          duration
          description
        }
      }
      createdAt
      updatedBy
    }
  }
`; 