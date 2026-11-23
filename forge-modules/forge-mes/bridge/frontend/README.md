# Manufacturing Execution System (MES) Frontend

A comprehensive Manufacturing Execution System (MES) frontend built with NextJS, designed specifically for custom whiskey manufacturing operations. The system integrates with existing Ignition Perspective assets and connects to a full backend with REST API and GraphQL endpoints containing real production data.

## 🚀 Features

- **Recipe Management**: Comprehensive master recipe configuration system for custom whiskey production
- **Production Scheduling**: Intelligent scheduling system integrated with ERP and recipe management
- **Live Production Monitoring**: Real-time visibility into current production status and order progress
- **Dashboarding & Reporting**: Customizable analytics and reporting platform for operational insights
- **AI Integration**: Comprehensive AI-powered assistance throughout the manufacturing process

## 🛠 Tech Stack

- **Framework**: NextJS 15+ with App Router
- **Language**: TypeScript with strict mode
- **Styling**: TailwindCSS + Shadcn UI components
- **State Management**: Zustand for global state
- **Data Fetching**: React Query/TanStack Query
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts for data visualization
- **GraphQL**: Apollo Client
- **Icons**: Lucide React

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Access to MES backend API (REST + GraphQL)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mes-ui
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp config/env.example .env.local
   ```
   
   Update `.env.local` with your actual API endpoints and credentials:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   NEXT_PUBLIC_GRAPHQL_URL=http://localhost:3001/graphql
   NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
   # ... other variables
   ```

4. **Start the WebSocket server (for real-time features)**
   ```bash
   npm run ws-server
   ```
   
   This starts a development WebSocket server on `ws://localhost:3001/ws` for testing real-time manufacturing data updates.

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🏗 Project Structure

```
mes-ui/
├── app/                          # NextJS App Router pages
│   ├── configuration/           # Configuration management
│   ├── dashboard/              # Dashboard and analytics
│   ├── recipe-management/      # Recipe management system
│   └── scheduling/             # Production scheduling
├── components/                 # Reusable components
│   └── ui/                    # Shadcn UI components
├── lib/                       # Utility libraries
│   ├── api.ts                # API client utilities
│   ├── react-query.tsx       # React Query configuration
│   └── utils.ts              # General utilities
├── stores/                    # Zustand state stores
│   └── auth-store.ts         # Authentication state
├── types/                     # TypeScript type definitions
│   └── index.ts              # Core MES types
├── config/                    # Configuration files
│   └── env.example           # Environment variables template
└── tasks/                     # TaskMaster AI project management
```

## 🔑 Key Dependencies

### UI & Styling
- `@radix-ui/*` - Accessible UI primitives
- `tailwindcss` - Utility-first CSS framework
- `lucide-react` - Icon library
- `class-variance-authority` - CSS class utilities

### Data Management
- `@tanstack/react-query` - Server state management
- `zustand` - Client state management
- `@apollo/client` - GraphQL client
- `react-hook-form` - Form handling
- `zod` - Schema validation

### Visualization
- `recharts` - Chart library for manufacturing data
- `date-fns` - Date utility library

## 🚦 Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run ws-server` - Start WebSocket development server for real-time features

## 🔧 Configuration

### TypeScript
The project uses strict TypeScript configuration with additional safety features:
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`
- `noPropertyAccessFromIndexSignature: true`
- `exactOptionalPropertyTypes: true`

### Path Aliases
Configured path aliases for clean imports:
- `@/*` - Root directory
- `@/components/*` - Components directory
- `@/lib/*` - Library utilities
- `@/types/*` - Type definitions
- `@/stores/*` - State stores
- `@/utils/*` - Utility functions

### React Query
Optimized for manufacturing data with:
- 2-minute stale time for frequently changing data
- 10-minute garbage collection time
- Smart retry logic for different error types
- Automatic refetch on window focus and reconnect

## 🔐 Authentication

The system uses role-based access control (RBAC) with the following roles:
- Production Manager
- Manufacturing Engineer
- Quality Control Specialist
- Production Operator
- Plant Supervisor
- Operations Director
- Admin

## 🌐 API Integration

### REST API
- Base URL: `NEXT_PUBLIC_API_URL`
- Authentication: Bearer token
- Error handling with proper HTTP status codes

### GraphQL
- Endpoint: `NEXT_PUBLIC_GRAPHQL_URL`
- Apollo Client with caching
- Real-time subscriptions support

### WebSocket
- Real-time updates: `NEXT_PUBLIC_WS_URL`
- Live production monitoring
- Equipment status updates

## 📊 Data Types

The system includes comprehensive TypeScript definitions for:
- User management and authentication
- Recipe management (ingredients, stages, parameters)
- Production scheduling (orders, equipment, personnel)
- Dashboard and analytics (KPIs, widgets, alerts)
- API responses and pagination

## 🎨 UI Components

Built with Shadcn UI components including:
- Forms (input, select, textarea, form)
- Data display (table, card, badge, alert)
- Navigation (breadcrumb, dropdown-menu, tabs)
- Overlays (dialog, sheet)
- Interactive elements (button)

## 🔄 State Management

### Global State (Zustand)
- Authentication state
- User permissions
- Application settings

### Server State (React Query)
- Recipe data
- Production orders
- Equipment status
- Dashboard metrics

## 🚀 Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Set production environment variables**
   Update environment variables for production endpoints

3. **Deploy to your platform**
   The application can be deployed to Vercel, Netlify, or any Node.js hosting platform

## 🤝 Contributing

1. Follow the established code style and TypeScript conventions
2. Use the TaskMaster AI system for project management
3. Ensure all components are accessible and responsive
4. Write comprehensive tests for new features
5. Update documentation for any new functionality

## 📝 License

[Add your license information here]

## 🆘 Support

For support and questions:
- Check the TaskMaster AI tasks for current development status
- Review the API documentation for backend integration
- Consult the component library documentation for UI guidelines
