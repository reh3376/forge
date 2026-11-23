// Generic GraphQL Recipe Search Implementation
// This can be adapted to work with any GraphQL client (Apollo, urql, etc.)

// Available filter fields based on the actual schema
export interface RecipeSearchFilters {
  Recipe?: {
    contains?: string;
    mode?: 'Insensitive';
  };
  customerCode?: {
    contains?: string;
    mode?: 'Insensitive';
  };
  whiskeyType?: 
    | "RyeBourbon"
    | "WheatedBourbon" 
    | "FourGrainBourbon"
    | "RyeWhiskey"
    | "WheatWhiskey"
    | "MaltWhiskey"
    | "FourGrainWhiskey";
  active?: {
    equals?: boolean;
  };
  cooksPerFerm?: {
    equals?: number;
    gte?: number;
    lte?: number;
  };
  revision?: {
    equals?: number;
    gte?: number;
    lte?: number;
  };
}

// Recipe interface matching your schema
export interface Recipe {
  id: string;
  Recipe: string;
  active?: boolean;
  whiskeyType?: string;
  customerCode?: string;
  cooksPerFerm?: number;
  revision?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy?: string;
  customer?: {
    id: string;
    name: string;
    customerCode: string;
  };
}

// GraphQL query string (can be used with any GraphQL client)
export const SEARCH_RECIPES_QUERY = `
  query SearchRecipes($where: RecipeWhereInput, $take: Float, $skip: Float, $orderBy: [RecipeOrderByInput!]) {
    recipes(where: $where, take: $take, skip: $skip, orderBy: $orderBy) {
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
        recipeBomITem {
          id
          quantity
          operation
          item {
            id
            itemName
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
        recipeSetpointType
        recipeNumericalSetpoint
        recipeSetpointBooleanValue
        required
        active
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
    }
  }
`;

// Generic GraphQL client interface
export interface GraphQLClient {
  query(query: string, variables?: any): Promise<{ data: any; errors?: any[] }>;
}

// Recipe search service that implements OR-like functionality
export class RecipeSearchService {
  constructor(private graphqlClient: GraphQLClient) {}

  /**
   * Search recipes with OR-like functionality by combining multiple queries
   * Since the schema doesn't support OR operators, we make separate queries
   * and combine the results on the client side
   */
  async searchRecipesWithOR(
    searchTerm: string,
    limit: number = 50
  ): Promise<Recipe[]> {
    const queries = [
      // Search by recipe name
      this.searchRecipes({
        Recipe: { contains: searchTerm, mode: 'Insensitive' }
      }, limit),
      
      // Search by customer code
      this.searchRecipes({
        customerCode: { contains: searchTerm, mode: 'Insensitive' }
      }, limit),
    ];

    // If searchTerm matches a whiskey type, add that search too
    const whiskeyTypes = [
      "RyeBourbon", "WheatedBourbon", "FourGrainBourbon",
      "RyeWhiskey", "WheatWhiskey", "MaltWhiskey", "FourGrainWhiskey"
    ];
    
    const matchingWhiskeyType = whiskeyTypes.find(type => 
      type.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (matchingWhiskeyType) {
      queries.push(
        this.searchRecipes({
          whiskeyType: matchingWhiskeyType as any
        }, limit)
      );
    }

    try {
      const results = await Promise.all(queries);
      
      // Combine and deduplicate results
      const allRecipes: Recipe[] = [];
      const seenIds = new Set<string>();
      
      for (const result of results) {
        for (const recipe of result) {
          if (!seenIds.has(recipe.id)) {
            seenIds.add(recipe.id);
            allRecipes.push(recipe);
          }
        }
      }
      
      // Sort by recipe name
      return allRecipes.sort((a, b) => a.Recipe.localeCompare(b.Recipe));
    } catch (error) {
      console.error('Error searching recipes:', error);
      throw error;
    }
  }

  /**
   * Search recipes with specific filters
   */
  async searchRecipes(
    filters: RecipeSearchFilters,
    limit: number = 50,
    skip: number = 0
  ): Promise<Recipe[]> {
    const result = await this.graphqlClient.query(SEARCH_RECIPES_QUERY, {
      where: filters,
      take: limit,
      skip,
      orderBy: [{ Recipe: 'asc' }]
    });

    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'GraphQL query failed');
    }

    return result.data?.recipes || [];
  }

  /**
   * Search recipes by customer with additional filters
   */
  async searchRecipesByCustomer(
    customerCode: string, 
    additionalFilters?: Partial<RecipeSearchFilters>,
    limit: number = 50
  ): Promise<Recipe[]> {
    const filters: RecipeSearchFilters = {
      customerCode: { contains: customerCode, mode: 'Insensitive' },
      ...additionalFilters
    };

    return this.searchRecipes(filters, limit);
  }

  /**
   * Search recipes by whiskey type
   */
  async searchRecipesByWhiskeyType(
    whiskeyType: RecipeSearchFilters['whiskeyType'],
    additionalFilters?: Partial<RecipeSearchFilters>,
    limit: number = 50
  ): Promise<Recipe[]> {
    const filters: RecipeSearchFilters = {
      whiskeyType,
      ...additionalFilters
    };

    return this.searchRecipes(filters, limit);
  }

  /**
   * Get active recipes only
   */
  async getActiveRecipes(
    additionalFilters?: Partial<RecipeSearchFilters>,
    limit: number = 50
  ): Promise<Recipe[]> {
    const filters: RecipeSearchFilters = {
      active: { equals: true },
      ...additionalFilters
    };

    return this.searchRecipes(filters, limit);
  }
}

// Example usage with fetch API (can be adapted for Apollo Client, etc.)
export class FetchGraphQLClient implements GraphQLClient {
  constructor(private endpoint: string, private headers: Record<string, string> = {}) {}

  async query(query: string, variables?: any): Promise<{ data: any; errors?: any[] }> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}

// Example usage:
/*
const client = new FetchGraphQLClient(
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:3000/graphql'
);
const searchService = new RecipeSearchService(client);

// Search with OR-like functionality
const recipes = await searchService.searchRecipesWithOR('bourbon');

// Search with specific filters
const activeBourbons = await searchService.searchRecipes({
  whiskeyType: 'RyeBourbon',
  active: { equals: true }
});

// Search by customer
const customerRecipes = await searchService.searchRecipesByCustomer('BHK');
*/ 