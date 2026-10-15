import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'


// Types for recipe
interface Recipe {
  id: string
  Recipe: string
  customerCode: string
  whiskeyType: string
}

export async function GET() {
  try {
    const graphqlQuery = `
      query GetActiveRecipes {
        recipes(where: { active: { equals: true } }) {
          id
          Recipe
          customerCode
          whiskeyType
        }
      }
    `;

    // Use the GraphQL proxy which handles authentication automatically
    const response = await fetch(`${process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : ''}/api/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: graphqlQuery,
      }),
    });

    if (!response.ok) {
      console.error('GraphQL response not ok:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch recipes' },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return NextResponse.json(
        { error: 'GraphQL query failed', details: data.errors },
        { status: 400 }
      );
    }

    // Transform the data to match the expected format
    const recipes = data.data.recipes.map((recipe: Recipe) => ({
      id: recipe.id,
      name: recipe.Recipe,
      customerCode: recipe.customerCode,
      whiskeyType: recipe.whiskeyType,
    }))

    return NextResponse.json({
      success: true,
      recipes,
      totalCount: recipes.length,
    })

  } catch (error) {
    console.error('Error fetching recipes:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch recipes',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
} 