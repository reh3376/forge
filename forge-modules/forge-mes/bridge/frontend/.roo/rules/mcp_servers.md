---
description: 
globs: 
alwaysApply: true
---
# MCP Server Usage Guidelines

This guide helps determine which MCP server to use for different development scenarios based on the configured servers in `.roo/mcp.json`.

## **Core Development Servers**

### **Context7 (`context_7`)**
- **When to Use:**
  - Looking up current library documentation (React, Next.js, TypeScript, etc.)
  - Need up-to-date API references and best practices
  - Verifying syntax for newer framework features
  - Getting examples for unfamiliar libraries or patterns

- **Use Cases:**
  ```
  // ✅ DO: Use for current documentation
  "How do I use React Server Components with Next.js 14?"
  "What's the latest TypeScript syntax for generic constraints?"
  "Show me Prisma 5.x query examples"
  ```

- **Don't Use For:**
  - Codebase-specific questions
  - Local database queries
  - Project file modifications

### **BrowserMCP (`browsermcp`)**
- **When to Use:**
  - Testing web applications in real browsers
  - Debugging UI/UX issues that require visual inspection
  - Automated testing workflows
  - Taking screenshots for documentation
  - Interacting with external web services during development

- **Use Cases:**
  ```
  // ✅ DO: Use for browser automation
  "Navigate to the login page and test the authentication flow"
  "Take a screenshot of the dashboard component"
  "Test responsive design on mobile viewport"
  "Verify the form submission works end-to-end"
  ```

- **Don't Use For:**
  - Code generation or editing
  - Database operations
  - Server-side logic testing

## **Database Operations**

### **PostgreSQL Local (`postgres-mes-local`)**
- **When to Use:**
  - Local development database queries
  - Testing database schema changes
  - Data analysis and reporting during development
  - Database performance optimization
  - Validating data integrity

- **Use Cases:**
  ```sql
  -- ✅ DO: Use for local database operations
  SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days';
  
  -- Query optimization and index analysis
  EXPLAIN ANALYZE SELECT * FROM orders o JOIN users u ON o.user_id = u.id;
  
  -- Schema exploration
  \d+ table_name
  ```

- **Access Level:** Unrestricted (can modify data)
- **Environment:** `postgresql://mes:***@localhost:5432/whk-mes`

### **PostgreSQL Production (`postgres-mes-prod`)**
- **When to Use:**
  - Read-only production data analysis
  - Troubleshooting production issues
  - Performance monitoring and analysis
  - Data validation against production

- **Use Cases:**
  ```sql
  -- ✅ DO: Use for production analysis (read-only)
  SELECT COUNT(*) FROM orders WHERE status = 'pending';
  
  -- Performance analysis
  SELECT pg_stat_statements;
  ```

- **Access Level:** Restricted (read-only)
- **Environment:** `postgresql://mes:***@10.4.8.16:5432/whk-mes`
- **⚠️ Warning:** Production environment - use carefully

## **GraphQL APIs**

### **MES GraphQL (`mcp-graphql-mes`)**
- **When to Use:**
  - Manufacturing execution system data queries
  - Production line status and metrics
  - Work order management
  - Quality control data

- **Use Cases:**
  ```graphql
  # ✅ DO: Use for MES-specific queries
  query ProductionStatus {
    workOrders(filter: { status: ACTIVE }) {
      id
      product { name }
      quantity
      completedQuantity
    }
  }
  ```

- **Endpoint:** `http://localhost:3000/graphql`

### **WMS GraphQL (`mcp-graphql-wms`)**
- **When to Use:**
  - Warehouse management system data
  - Inventory tracking and management
  - Shipping and receiving operations
  - Stock level monitoring

- **Use Cases:**
  ```graphql
  # ✅ DO: Use for WMS-specific queries
  query InventoryLevels {
    products {
      sku
      currentStock
      reservedStock
      availableStock
    }
  }
  ```

- **Endpoint:** `http://localhost:3020/graphql`

## **UI Development**

### **21st Dev Magic (`@21st-dev/magic`)**
- **When to Use:**
  - Generating modern React components
  - Creating UI elements with Tailwind CSS
  - Building responsive layouts
  - Searching for component inspiration

- **Use Cases:**
  ```
  // ✅ DO: Use for UI component requests
  "/ui create a modern data table with sorting"
  "/21 generate a responsive card component"
  "Create a form with validation using React Hook Form"
  ```

- **Features:**
  - Component builder
  - Logo search_files
  - Component inspiration
  - Component refiner

## **Project Management**

### **TaskMaster AI (`taskmaster-ai`)**
- **When to Use:**
  - Managing project tasks and subtasks
  - Breaking down complex features into manageable work
  - Tracking development progress
  - Planning implementation sequences

- **Use Cases:**
  ```
  // ✅ DO: Use for project management
  "Get the next task to work on"
  "Break down the authentication feature into subtasks"
  "Mark task 15 as completed"
  "Update tasks based on new requirements"
  ```

- **Configured Models:**
  - Main: `claude-3-7-sonnet-20250219`
  - Research: `sonar-pro` (Perplexity)

## **External Integrations**

### **GitHub (`github`)**
- **When to Use:**
  - Repository management
  - Issue tracking and management
  - Pull request operations
  - Code review workflows

### **Jira (`jira`)**
- **When to Use:**
  - Project ticket management
  - Sprint planning and tracking
  - Issue creation and updates
  - Workflow automation

### **Vercel (`vercel`)**
- **When to Use:**
  - Deployment management
  - Environment variable configuration
  - Build and deployment monitoring
  - Domain and DNS management

## **Decision Matrix**

| Task Type | Primary Server | Secondary Server | Notes |
|-----------|---------------|------------------|-------|
| Database Schema Design | `postgres-mes-local` | `context_7` | Local for testing, Context7 for best practices |
| UI Component Development | `@21st-dev/magic` | `context_7` | Magic for generation, Context7 for documentation |
| Production Debugging | `postgres-mes-prod` | `mcp-graphql-mes` | Read-only database + API queries |
| Web Testing | `browsermcp` | - | Browser automation for E2E testing |
| Task Planning | `taskmaster-ai` | `jira` | TaskMaster for technical breakdown, Jira for business tracking |
| API Documentation | `context_7` | `mcp-graphql-*` | Context7 for standards, GraphQL for schema |

## **Best Practices**

- **Start with Context7** for any documentation or best practice questions
- **Use local databases** (`postgres-mes-local`) for development and testing
- **Reserve production databases** (`postgres-mes-prod`) for troubleshooting only
- **Use browsermcp** for visual testing and user experience validation
- **Combine servers** when appropriate (e.g., Context7 + postgres-mes-local for schema design)
- **TaskMaster AI** should be the default for project management and task breakdown

## **Security Considerations**

- **Production Access:** Only `postgres-mes-prod` has restricted access - use responsibly
- **API Keys:** All servers have appropriate authentication configured
- **Local Development:** `postgres-mes-local` and GraphQL endpoints are localhost-only
- **Browser Automation:** `browsermcp` can access external sites - be mindful of sensitive data

## **Troubleshooting**

- **Server Not Responding:** Check if the service is running (especially for local GraphQL endpoints)
- **Authentication Errors:** Verify API keys in mcp.json are current
- **Database Connection Issues:** Ensure PostgreSQL services are running
- **GraphQL Schema Changes:** Use introspection tools to verify current schema
