# Claude Code Agents for WhiskeyHouse MES

This directory contains specialized agent configurations for working on the WhiskeyHouse Manufacturing Execution System. Each agent is optimized for specific aspects of the codebase and development workflow.

## Available Agents

### 1. Testing Agent (`testing-agent.md`)
**Purpose**: Testing, test coverage, building, executing, and fixing tests

**Use For**:
- Writing unit tests (Jest for backend/frontend)
- Creating E2E tests (Playwright for frontend)
- Analyzing and improving test coverage
- Debugging failing tests
- Setting up test infrastructure
- Testing RabbitMQ, MQTT, and NetSuite integrations (with mocking)

**Key Capabilities**:
- Backend testing patterns (NestJS + Prisma)
- Frontend testing (React Testing Library + Playwright)
- Manufacturing-specific test scenarios (orders, recipes, batches, inventory)
- Mock external services (NetSuite, MQTT, RabbitMQ)
- Test data seeding strategies

**Example Invocation**:
```
I need help writing comprehensive tests for the ProductionOrderService, including
tests for order creation, queue positioning, and NetSuite sync. Please also check
current coverage and identify gaps.
```

---

### 2. Architecture Agent (`architecture-agent.md`)
**Purpose**: Software architecture, sync/async services, on-prem integration, messaging

**Use For**:
- Designing system architecture and integration patterns
- Implementing RabbitMQ messaging and event-driven architecture
- MQTT integration for equipment/sensors
- NetSuite ERP synchronization patterns
- Real-time WebSocket implementations
- Async API design
- Distributed system patterns (CQRS, Event Sourcing, Sagas)
- Resilience patterns (Circuit Breaker, Retry, DLQ)

**Key Capabilities**:
- Sync vs async communication design
- Message broker patterns (RabbitMQ exchanges, topics, queues)
- MQTT/UNS architecture for equipment integration
- NetSuite bidirectional sync strategies
- Event-driven architecture patterns
- Monitoring and observability

**Example Invocation**:
```
I need to design an asynchronous workflow for syncing production order updates to
NetSuite. The system should handle NetSuite downtime gracefully and ensure eventual
consistency. Please propose an architecture using RabbitMQ.
```

---

### 3. Frontend Design Agent (`frontend-design-agent.md`)
**Purpose**: UI/UX design, component development, user experience

**Use For**:
- Designing and implementing UI components
- Creating manufacturing-specific interfaces (dashboards, forms, monitoring)
- Responsive design for desktop/tablet/shop floor displays
- shadcn/ui + Tailwind component patterns
- Real-time data visualization
- Form handling with React Hook Form + Zod
- Accessibility (a11y) implementation
- Performance optimization (code splitting, memoization)

**Key Capabilities**:
- Next.js 15 App Router patterns
- shadcn/ui design system implementation
- Manufacturing UI patterns (wizards, timelines, monitors)
- GraphQL integration with Apollo Client
- Real-time updates with WebSockets
- Responsive and accessible design

**Example Invocation**:
```
I need to create a real-time batch monitoring dashboard that displays temperature,
pressure, and pH from MQTT sensors. It should update live, show historical trends,
and work well on both desktop and shop floor tablets.
```

---

### 4. Requirements Agent (`requirements-agent.md`)
**Purpose**: Requirements gathering, specification creation, ideation

**Use For**:
- Gathering detailed feature requirements through structured questioning
- Creating comprehensive feature specifications
- Defining user stories and acceptance criteria
- Analyzing technical feasibility
- Documenting business processes and workflows
- Identifying integration requirements
- Planning data model changes

**Key Capabilities**:
- Structured requirements elicitation (5W2H method)
- Manufacturing-specific domain questions
- Integration requirement analysis (NetSuite, MQTT, RabbitMQ)
- User story and acceptance criteria creation
- Complete specification document generation
- Risk assessment and mitigation planning

**Example Invocation**:
```
I have a new feature idea for automated enzyme dosing calculations. Can you help me
gather requirements by asking detailed questions about the workflow, calculations,
user roles, and integration needs? Then create a complete specification.
```

---

## How to Use These Agents

### Option 1: Direct Reference
Copy the relevant agent's content and use it as context when working on specific tasks:

```
Using the patterns from .claude/agents/testing-agent.md, please help me write
comprehensive tests for the RecipeService.
```

### Option 2: Invoke via Task Tool (Recommended)
When Claude Code supports custom agents, invoke them directly:

```
@testing-agent Please analyze the test coverage for the production order module
and create tests for any gaps you find.
```

### Option 3: Hybrid Approach
Reference the agent for patterns, then execute the task:

```
Following the architecture patterns in .claude/agents/architecture-agent.md,
implement a RabbitMQ event publisher for production order status changes.
```

---

## Agent Specializations by Module

### Production Order Features
- **Requirements Agent**: Gather order creation workflow requirements
- **Architecture Agent**: Design order lifecycle and NetSuite sync
- **Frontend Agent**: Build production order wizard UI
- **Testing Agent**: Test order creation, validation, and queue positioning

### Recipe Management Features
- **Requirements Agent**: Define recipe instance modification requirements
- **Architecture Agent**: Design recipe versioning and parameter management
- **Frontend Agent**: Create recipe editor interface
- **Testing Agent**: Test recipe BOM calculations and parameter validation

### Batch Monitoring Features
- **Requirements Agent**: Gather real-time monitoring requirements
- **Architecture Agent**: Design MQTT subscription and WebSocket broadcasting
- **Frontend Agent**: Build live monitoring dashboards
- **Testing Agent**: Test MQTT message handling and real-time updates

### Inventory & Lot Traceability
- **Requirements Agent**: Define traceability requirements and workflows
- **Architecture Agent**: Design lot genealogy and inventory transactions
- **Frontend Agent**: Create lot tracking and inventory transfer UIs
- **Testing Agent**: Test lot consumption and traceability queries

### NetSuite Integration
- **Requirements Agent**: Gather sync requirements and mapping rules
- **Architecture Agent**: Design bidirectional sync and error handling
- **Frontend Agent**: Build sync status and conflict resolution UIs
- **Testing Agent**: Test sync operations with mocked NetSuite API

---

## Combining Agents

For complex features, use multiple agents in sequence:

1. **Requirements Agent**: Gather and document requirements
2. **Architecture Agent**: Design technical solution and integrations
3. **Frontend Agent**: Implement user interface
4. **Testing Agent**: Create comprehensive test coverage

**Example Workflow**:
```
# Step 1: Requirements
@requirements-agent I need to add automatic lot expiration alerts. Please ask
questions to understand the full requirement.

# Step 2: Architecture
@architecture-agent Based on the requirements doc, design a system that checks
lot expiration dates daily and publishes alerts via RabbitMQ.

# Step 3: Frontend
@frontend-agent Create a dashboard widget that displays upcoming lot expirations
with visual indicators for urgency.

# Step 4: Testing
@testing-agent Write comprehensive tests for the lot expiration system, including
unit tests for the service and E2E tests for the dashboard widget.
```

---

## Agent-Specific Commands Reference

### Testing Agent Commands
```bash
# Run all tests
make test

# Run specific module tests
make test-backend
make test-frontend
make test-e2e

# Generate coverage
cd apps/whk-recipe-configuration && npm run test:cov
cd apps/mes-ui && npm run test:coverage

# Interactive seed for test data
cd apps/whk-recipe-configuration && npm run seed:interactive
```

### Architecture Agent Commands
```bash
# Start infrastructure
make db-dev  # PostgreSQL, Redis
docker compose -f apps/whk-recipe-configuration/docker-compose.dev.yml up -d

# View RabbitMQ Management
# http://localhost:15672 (guest/guest)

# Monitor MQTT topics
# Use MQTT Explorer or mosquitto_sub

# Check health endpoints
curl http://localhost:3000/health
```

### Frontend Agent Commands
```bash
# Start frontend dev server
make dev-frontend

# Run Storybook (if configured)
cd apps/mes-ui && npm run storybook

# Build for production
make build-frontend

# Run Playwright tests
make test-e2e
cd apps/mes-ui && npm run test:e2e:ui
```

### Requirements Agent Commands
```bash
# Generate documentation
npm run docs:generate

# View database schema
make db-studio

# Generate ERD
cd apps/whk-recipe-configuration && npm run docs:erd
```

---

## Manufacturing Domain Context

All agents have knowledge of:

- **Production Systems**: Production orders, schedule orders, queue management
- **Recipe Management**: Master recipes, active instances, BOM, mashing protocols
- **Equipment**: Mash tuns, fermenters, bright tanks, sensors
- **Inventory**: Lot traceability, item receipts, transfers, consumption
- **Quality**: Parameters (temp, pH, gravity), testing, approvals
- **Integration**: NetSuite ERP, MQTT equipment, RabbitMQ messaging
- **Real-time**: WebSocket updates, MQTT telemetry, live dashboards

---

## Best Practices

1. **Be Specific**: Provide context about which module/feature you're working on
2. **Reference Existing Patterns**: Agents know the codebase structure and patterns
3. **Ask Questions**: Agents will ask clarifying questions if needed
4. **Iterate**: Start with requirements, then architecture, then implementation
5. **Test Early**: Involve testing agent early in the development process
6. **Consider Integration**: Always think about NetSuite, MQTT, and RabbitMQ impacts
7. **Think Manufacturing**: Consider production workflows, lot traceability, quality control

---

## Updating Agents

As the codebase evolves, update agents with:
- New patterns and conventions
- Updated technology stack
- New integration points
- Lessons learned from implementations

Agents should stay synchronized with CLAUDE.md and actual codebase practices.

---

## Support

For questions about agent usage or to suggest improvements:
1. Review the agent's markdown file for detailed guidance
2. Check CLAUDE.md for general codebase information
3. Refer to `/docs` for domain-specific documentation
4. Create issues for agent enhancements

---

**Remember**: These agents are specialized tools. Use the right agent for the task at hand, and don't hesitate to combine them for complex features!
