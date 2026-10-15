import { SchemaFetcher } from '@/components/debug/schema-fetcher'

export default function SchemaTestPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Database Schema Test</h1>
        <p className="text-muted-foreground mt-2">
          Test database connectivity and schema validation for both GraphQL and OpenAPI specifications.
        </p>
      </div>
      
      <SchemaFetcher />
    </div>
  )
} 