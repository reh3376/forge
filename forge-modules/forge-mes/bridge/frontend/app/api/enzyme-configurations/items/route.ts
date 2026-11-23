import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'


// Types for enzyme items
interface EnzymeItem {
  id: string
  itemNumber: string
  itemName: string
  itemType: string
  itemClass: string
}

export async function GET() {
  try {
    const graphqlQuery = `
      query GetEnzymeItems {
        items(where: { itemNumber: { contains: "ENZ" } }) {
          id
          itemNumber
          itemName
          itemType
          itemClass
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
        { error: 'Failed to fetch enzyme items' },
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
    const items = data.data.items.map((item: EnzymeItem) => ({
      id: item.id,
      itemNumber: item.itemNumber,
      itemName: item.itemName,
      itemType: item.itemType,
      itemClass: item.itemClass,
    }))

    return NextResponse.json({
      success: true,
      items,
      totalCount: items.length,
    })

  } catch (error) {
    console.error('Error fetching enzyme items:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch enzyme items',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
} 