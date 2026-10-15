import { useState, useEffect } from 'react'

export interface Unit {
  id: string
  name: string
  abbreviation: string
  active: boolean
}

export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query GetUnits {
                unitsItems {
                  id
                  name
                  abbreviation
                  active
                }
              }
            `
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        
        if (result.errors) {
          throw new Error(result.errors[0]?.message || 'GraphQL error')
        }

        // Filter to only active units and sort by name
        const activeUnits = result.data.unitsItems
          .filter((unit: Unit) => unit.active)
          .sort((a: Unit, b: Unit) => a.name.localeCompare(b.name))
        
        setUnits(activeUnits)
      } catch (err) {
        console.error('Error fetching units:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch units')
        // Fallback to default units if API fails
        setUnits([
          { id: 'fallback-gallons', name: 'Gallons', abbreviation: 'gal', active: true },
          { id: 'fallback-barrels', name: 'Barrels', abbreviation: 'bbl', active: true },
          { id: 'fallback-liters', name: 'Liters', abbreviation: 'L', active: true }
        ])
      } finally {
        setIsLoading(false)
      }
    }

    fetchUnits()
  }, [])

  return { units, isLoading, error }
} 