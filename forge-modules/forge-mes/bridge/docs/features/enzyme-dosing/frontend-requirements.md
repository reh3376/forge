# Enzyme Dosing Frontend Requirements Document

## Executive Summary

This document outlines the requirements for developing a production-focused enzyme dosing frontend application that integrates with the existing WhiskeyHouse Manufacturing Execution System (MES). The frontend will provide operators with an intuitive interface for calculating enzyme dosing amounts based on mash bills and grain loads, while leveraging the robust backend infrastructure already implemented.

## Project Context

### Existing Backend Infrastructure
The WhiskeyHouse MES already includes a comprehensive enzyme configuration system:

- **EnzymeDosingService**: Database-driven enzyme dosing calculations with caching
- **EnzymeConfigurationService**: Full CRUD operations for enzyme configurations
- **SystemConfigurationService**: Global system parameter management
- **REST API**: Complete enzyme configuration endpoints with authentication
- **Database Schema**: EnzymeConfiguration, EnzymeCalculationRule, and SystemConfiguration models
- **Admin UI**: React Admin-based configuration management interface

### Current Status
All backend tasks are **100% complete** (9/9 main tasks, 45/45 subtasks), including:
- Database schema and migrations
- Service layer implementation
- REST API with full CRUD operations
- Admin UI for configuration management
- Audit trail system
- Data migration from hardcoded values

## Target Users

### Primary Users
- **Production Operators**: Front-line workers who need to calculate enzyme dosing for batches
- **Shift Supervisors**: Team leads who oversee production operations
- **Quality Control Technicians**: Staff responsible for ensuring proper enzyme application

### Secondary Users
- **Production Managers**: Management oversight of enzyme usage and efficiency
- **Process Engineers**: Technical staff who may need to review dosing calculations

## Core Requirements

### 1. Enzyme Dosing Calculator

#### 1.1 Input Interface
- **Mash Bill Input**: 
  - Format: "XX-XX-XX-XX" (corn-rye-wheat-malt percentages)
  - Validation: Must sum to 100%
  - Examples: "70-21-00-09", "51-45-00-04"
- **Total Grain Load**: 
  - Input in pounds (lbs)
  - Range: 1,000 - 50,000 lbs (typical distillery batch sizes)
  - Decimal precision: 2 places
- **Enzyme Selection**:
  - Dropdown/searchable list of available enzymes
  - Categories: Liquifaction, Saccharification, Viscosity
  - Real-time filtering by category

#### 1.2 Calculation Engine Integration
- **API Integration**: Use existing `/api/recipeBoms/:id/calculateEnzymeDosing` endpoint
- **Real-time Calculations**: Update dosing amounts as inputs change
- **Multiple Enzymes**: Calculate dosing for multiple enzymes simultaneously
- **Error Handling**: Clear feedback for invalid inputs or calculation failures

#### 1.3 Results Display
- **Dosing Amount**: Display in pounds with 3 decimal precision
- **Instructions**: Show application instructions for each enzyme
- **Category Information**: Display enzyme category and type
- **Conversion Factors**: Show metric ton conversions for transparency

### 2. Configuration Management Viewer

#### 2.1 Enzyme Configuration Display
- **Read-only View**: Display current enzyme configurations
- **Search and Filter**: Find configurations by name, category, or item
- **Configuration Details**: Show dose per metric ton, instructions, active status
- **Last Updated**: Display modification timestamps and user information

#### 2.2 System Configuration Display
- **Global Parameters**: Show metric ton divisor, cache TTL settings
- **Configuration Status**: Display active/inactive configurations
- **Refresh Capability**: Manual refresh of configuration data

### 3. Production Order Integration

#### 3.1 Recipe BOM Integration
- **Recipe Selection**: Choose from existing recipe BOMs
- **Auto-populate**: Fill mash bill and grain load from selected recipe
- **Recipe Details**: Display recipe name, version, and description
- **Batch Information**: Show production order details when available

#### 3.2 Batch Tracking
- **Batch ID Association**: Link calculations to specific production batches
- **Historical Reference**: View previous calculations for similar recipes
- **Production Notes**: Add operator notes to calculations

### 4. Reporting and Analytics

#### 4.1 Calculation History
- **Calculation Log**: Store and display previous calculations
- **Search History**: Find calculations by date, recipe, or operator
- **Export Capability**: Export calculations to CSV/PDF formats
- **Audit Trail**: Track who performed calculations and when

#### 4.2 Usage Analytics
- **Enzyme Usage Trends**: Display enzyme consumption patterns
- **Cost Analysis**: Calculate enzyme costs per batch
- **Efficiency Metrics**: Track dosing accuracy and waste reduction
- **Dashboard View**: Summary metrics for management

## Technical Requirements

### 1. Technology Stack

#### 1.1 Frontend Framework
- **Next.js 14+**: App Router for modern React development
- **TypeScript**: Type safety and better developer experience
- **React 18+**: Latest React features and concurrent rendering

#### 1.2 UI Framework
- **Tailwind CSS**: Utility-first CSS framework (existing standard)
- **Shadcn/ui**: Component library (existing standard)
- **Lucide React**: Icon library (existing standard)

#### 1.3 State Management
- **React Query (TanStack Query)**: Server state management and caching
- **Zustand**: Client-side state management for UI state
- **React Hook Form**: Form state management and validation

### 2. API Integration

#### 2.1 REST API Integration
- **Base URL**: Use existing `/api` endpoints
- **Authentication**: JWT token-based authentication (existing system)
- **Error Handling**: Comprehensive error boundary and retry logic
- **Caching**: Implement appropriate caching strategies

#### 2.2 Key Endpoints
- `GET /api/enzyme-configurations/for-dosing`: Active enzyme configurations
- `GET /api/recipeBoms/:id/calculateEnzymeDosing`: Enzyme dosing calculations
- `GET /api/recipeBoms`: Recipe BOM listings
- `GET /api/system-configurations`: System parameters

#### 2.3 WebSocket Integration
- **Real-time Updates**: Configuration changes and system status
- **Connection Management**: Automatic reconnection and error handling
- **Status Indicators**: Show connection status to users

### 3. Performance Requirements

#### 3.1 Response Times
- **Calculation Response**: < 500ms for enzyme dosing calculations
- **Page Load Time**: < 2 seconds for initial page load
- **Configuration Load**: < 1 second for enzyme configuration data

#### 3.2 Scalability
- **Concurrent Users**: Support 50+ simultaneous users
- **Data Volume**: Handle 1000+ enzyme configurations
- **Calculation History**: Store 10,000+ historical calculations

#### 3.3 Availability
- **Uptime**: 99.9% availability during production hours
- **Offline Capability**: Basic functionality when backend is unavailable
- **Error Recovery**: Graceful degradation and recovery mechanisms

### 4. Security Requirements

#### 4.1 Authentication & Authorization
- **Microsoft Entra ID**: Integration with existing authentication system
- **Role-Based Access**: Different access levels for operators vs. managers
- **Session Management**: Secure session handling and timeout

#### 4.2 Data Security
- **Input Sanitization**: Prevent XSS and injection attacks
- **HTTPS Only**: All communications over encrypted connections
- **Audit Logging**: Track all user actions and calculations

## User Experience Requirements

### 1. Design Principles

#### 1.1 Industrial/Manufacturing Aesthetic
- **Clean Interface**: Minimal distractions, focus on functionality
- **High Contrast**: Easy to read in industrial lighting conditions
- **Large Touch Targets**: Suitable for touch screens and gloved hands
- **Consistent Layout**: Predictable interface patterns

#### 1.2 Responsive Design
- **Mobile First**: Optimized for tablet and mobile devices
- **Desktop Support**: Full functionality on desktop computers
- **Orientation Support**: Works in both portrait and landscape modes

#### 1.3 Accessibility
- **WCAG 2.1 AA Compliance**: Meet accessibility standards
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader Support**: Proper ARIA labels and semantic HTML
- **Color Blind Friendly**: Don't rely solely on color for information

### 2. User Interface Components

#### 2.1 Calculator Interface
- **Step-by-Step Wizard**: Guide users through the calculation process
- **Input Validation**: Real-time feedback on input validity
- **Clear Labels**: Descriptive labels and help text
- **Progress Indicators**: Show calculation progress for complex operations

#### 2.2 Results Display
- **Summary Cards**: Clear display of calculated dosing amounts
- **Detailed Breakdown**: Show calculation methodology
- **Print-Friendly**: Optimized layouts for printing results
- **QR Codes**: Generate QR codes for batch tracking

#### 2.3 Navigation
- **Breadcrumb Navigation**: Clear path indication
- **Quick Actions**: Shortcuts to common tasks
- **Search Functionality**: Global search across all data
- **Recent Items**: Quick access to recently used recipes/calculations

### 3. Mobile Optimization

#### 3.1 Touch Interface
- **Gesture Support**: Swipe, pinch, and tap gestures
- **Touch Feedback**: Visual feedback for touch interactions
- **Thumb-Friendly**: Controls within easy thumb reach
- **Haptic Feedback**: Vibration feedback where appropriate

#### 3.2 Offline Capability
- **Service Worker**: Cache critical resources for offline use
- **Local Storage**: Store recent calculations and configurations
- **Sync Capability**: Sync data when connection is restored
- **Offline Indicators**: Clear indication of offline status

### 4. Progressive Web App (PWA)

#### 4.1 Installation
- **Add to Home Screen**: Install as native-like app
- **App Icons**: Proper app icons for different platforms
- **Splash Screen**: Branded loading screen
- **App Manifest**: Complete PWA manifest configuration

#### 4.2 Native Features
- **Push Notifications**: Alerts for system updates or issues
- **Background Sync**: Sync data in background
- **Camera Access**: Scan QR codes or barcodes
- **File System Access**: Save/load calculation files

## Integration Requirements

### 1. Existing System Integration

#### 1.1 MES UI Integration
- **Consistent Styling**: Match existing MES UI design system
- **Navigation Integration**: Integrate with existing navigation structure
- **Authentication Flow**: Use existing authentication mechanisms
- **Permission System**: Respect existing role-based permissions

#### 1.2 Configuration Management
- **Admin Interface**: Link to existing enzyme configuration admin UI
- **System Settings**: Access to system configuration parameters
- **User Management**: Integration with existing user management system

### 2. External System Integration

#### 2.1 ERP Integration (Future)
- **Production Orders**: Pull production order data
- **Inventory Management**: Check enzyme inventory levels
- **Cost Tracking**: Track enzyme usage costs
- **Reporting**: Export data to ERP systems

#### 2.2 Laboratory Systems (Future)
- **Quality Data**: Import quality control data
- **Test Results**: Display relevant test results
- **Compliance Tracking**: Track regulatory compliance
- **Documentation**: Link to quality documentation

## Data Requirements

### 1. Data Models

#### 1.1 Calculation Data
```typescript
interface EnzymeCalculation {
  id: string
  batchId?: string
  recipeId?: string
  mashBill: string
  totalGrainLbs: number
  calculations: Array<{
    enzymeId: string
    enzymeName: string
    category: string
    doseLbs: number
    instructions: string
  }>
  calculatedBy: string
  calculatedAt: Date
  notes?: string
}
```

#### 1.2 Configuration Data
```typescript
interface EnzymeConfiguration {
  id: string
  itemId: string
  name: string
  category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
  dosePerMetricTon: number
  instructions: string
  active: boolean
  lastUpdated: Date
}
```

### 2. Data Storage

#### 2.1 Local Storage
- **Calculation History**: Store recent calculations locally
- **User Preferences**: Save user interface preferences
- **Offline Data**: Cache critical data for offline use
- **Session Data**: Maintain session state

#### 2.2 Server Storage
- **Calculation Archive**: Long-term storage of all calculations
- **Audit Logs**: Complete audit trail of all actions
- **Configuration History**: Track configuration changes
- **User Activity**: Monitor user engagement and usage patterns

## Testing Requirements

### 1. Unit Testing
- **Component Testing**: Test all React components
- **Utility Functions**: Test calculation and validation functions
- **API Integration**: Mock API responses and test error handling
- **State Management**: Test state transitions and side effects

### 2. Integration Testing
- **API Integration**: Test real API interactions
- **Authentication Flow**: Test login and permission systems
- **Data Flow**: Test end-to-end data flow
- **Error Scenarios**: Test error handling and recovery

### 3. End-to-End Testing
- **User Workflows**: Test complete user journeys
- **Cross-Browser**: Test on multiple browsers
- **Mobile Testing**: Test on various mobile devices
- **Performance Testing**: Load testing and performance validation

### 4. User Acceptance Testing
- **Operator Testing**: Test with actual production operators
- **Usability Testing**: Validate user experience design
- **Accessibility Testing**: Verify accessibility compliance
- **Production Testing**: Test in production-like environment

## Deployment Requirements

### 1. Environment Setup

#### 1.1 Development Environment
- **Local Development**: Docker-based development environment
- **Hot Reloading**: Fast development feedback loop
- **Debug Tools**: Comprehensive debugging capabilities
- **Test Data**: Realistic test data for development

#### 1.2 Staging Environment
- **Production-like**: Mirror production environment
- **Test Data**: Sanitized production data
- **Performance Testing**: Load testing capabilities
- **User Testing**: Environment for user acceptance testing

#### 1.3 Production Environment
- **High Availability**: Redundant deployment architecture
- **Monitoring**: Comprehensive application monitoring
- **Logging**: Centralized logging and error tracking
- **Backup**: Regular backup and disaster recovery

### 2. CI/CD Pipeline

#### 2.1 Build Process
- **Automated Builds**: Triggered by code commits
- **Quality Gates**: Automated testing and code quality checks
- **Security Scanning**: Vulnerability scanning and dependency checks
- **Performance Testing**: Automated performance validation

#### 2.2 Deployment Process
- **Blue-Green Deployment**: Zero-downtime deployments
- **Rollback Capability**: Quick rollback to previous versions
- **Feature Flags**: Gradual feature rollout capability
- **Health Checks**: Automated health monitoring

## Success Criteria

### 1. User Adoption
- **90% User Adoption**: 90% of production operators using the system within 3 months
- **Daily Usage**: Average of 50+ calculations per day
- **User Satisfaction**: 4.5/5 user satisfaction rating
- **Training Time**: < 30 minutes training time for new users

### 2. Operational Efficiency
- **Calculation Speed**: 50% reduction in time to calculate enzyme dosing
- **Error Reduction**: 50% reduction in enzyme dosing errors
- **Waste Reduction**: 15% reduction in enzyme waste
- **Documentation**: 100% of calculations properly documented

### 3. Technical Performance
- **System Uptime**: 99.9% uptime during production hours
- **Response Time**: < 500ms average response time
- **Error Rate**: < 0.1% error rate for calculations
- **Mobile Performance**: 95% of functionality available on mobile

### 4. Business Impact
- **Cost Savings**: 10% reduction in enzyme costs
- **Compliance**: 100% compliance with documentation requirements
- **Audit Readiness**: Complete audit trail for all calculations
- **ROI**: Positive return on investment within 12 months

## Timeline and Phases

### Phase 1: Core Calculator (Weeks 1-4)
- Basic enzyme dosing calculator interface
- Integration with existing enzyme configuration API
- Mash bill input and validation
- Real-time calculation display
- Basic error handling and validation

### Phase 2: Enhanced Features (Weeks 5-8)
- Recipe BOM integration
- Calculation history and storage
- Print and export functionality
- Mobile optimization
- Offline capability

### Phase 3: Advanced Features (Weeks 9-12)
- Analytics and reporting dashboard
- Advanced search and filtering
- Batch tracking integration
- Performance optimization
- Comprehensive testing

### Phase 4: Production Deployment (Weeks 13-15)
- Production environment setup
- User training and documentation
- Performance monitoring
- Bug fixes and optimization
- Go-live support

## Risk Assessment

### 1. Technical Risks
- **API Dependencies**: Reliance on existing backend APIs
- **Performance**: Calculation performance under load
- **Browser Compatibility**: Support for older industrial browsers
- **Network Connectivity**: Handling poor network conditions

### 2. User Adoption Risks
- **Change Resistance**: Operators resistant to new technology
- **Training Requirements**: Need for comprehensive user training
- **Workflow Integration**: Fitting into existing production workflows
- **Mobile Adoption**: Acceptance of mobile/tablet interfaces

### 3. Mitigation Strategies
- **Phased Rollout**: Gradual introduction to minimize disruption
- **Extensive Testing**: Comprehensive testing with real users
- **Training Program**: Structured training and support program
- **Fallback Options**: Maintain existing processes during transition

## Conclusion

This enzyme dosing frontend will provide WhiskeyHouse with a modern, efficient interface for enzyme dosing calculations while leveraging the robust backend infrastructure already in place. The focus on user experience, mobile optimization, and production environment requirements ensures the solution will meet the needs of production operators while providing the reliability and performance required for manufacturing operations.

The comprehensive requirements outlined above provide a clear roadmap for development, ensuring all stakeholder needs are addressed while maintaining integration with existing systems and workflows. 