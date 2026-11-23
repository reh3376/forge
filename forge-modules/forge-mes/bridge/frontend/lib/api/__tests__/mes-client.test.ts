import { 
  GET_PRODUCTION_ORDERS, 
  GET_SCHEDULE_ORDERS, 
  GET_RECIPES, 
  GET_CUSTOMERS 
} from '../mes-client'

describe('MES Client GraphQL Queries', () => {
  describe('Query Structure', () => {
    it('should have valid production orders query', () => {
      expect(GET_PRODUCTION_ORDERS).toContain('query GetProductionOrders')
      expect(GET_PRODUCTION_ORDERS).toContain('productionOrders')
      expect(GET_PRODUCTION_ORDERS).toContain('id')
      expect(GET_PRODUCTION_ORDERS).toContain('name')
      expect(GET_PRODUCTION_ORDERS).toContain('status')
      expect(GET_PRODUCTION_ORDERS).toContain('recipe')
      expect(GET_PRODUCTION_ORDERS).toContain('customer')
      expect(GET_PRODUCTION_ORDERS).toContain('scheduleOrder')
    })

    it('should have valid schedule orders query', () => {
      expect(GET_SCHEDULE_ORDERS).toContain('query GetScheduleOrders')
      expect(GET_SCHEDULE_ORDERS).toContain('scheduleOrders')
      expect(GET_SCHEDULE_ORDERS).toContain('id')
      expect(GET_SCHEDULE_ORDERS).toContain('name')
      expect(GET_SCHEDULE_ORDERS).toContain('status')
      expect(GET_SCHEDULE_ORDERS).toContain('estimatedStart')
      expect(GET_SCHEDULE_ORDERS).toContain('estimatedEnd')
      expect(GET_SCHEDULE_ORDERS).toContain('productionOrders')
    })

    it('should have valid recipes query', () => {
      expect(GET_RECIPES).toContain('query GetRecipes')
      expect(GET_RECIPES).toContain('recipes')
      expect(GET_RECIPES).toContain('id')
      expect(GET_RECIPES).toContain('whiskeyType')
    })

    it('should have valid customers query', () => {
      expect(GET_CUSTOMERS).toContain('query GetCustomers')
      expect(GET_CUSTOMERS).toContain('customers')
      expect(GET_CUSTOMERS).toContain('id')
    })
  })

  describe('Query Variables', () => {
    it('should support pagination variables', () => {
      expect(GET_PRODUCTION_ORDERS).toContain('$take')
      expect(GET_PRODUCTION_ORDERS).toContain('$skip')
      expect(GET_PRODUCTION_ORDERS).toContain('$orderBy')
      expect(GET_PRODUCTION_ORDERS).toContain('$where')
    })

    it('should support filtering variables', () => {
      expect(GET_PRODUCTION_ORDERS).toContain('ProductionOrderWhereInput')
      expect(GET_SCHEDULE_ORDERS).toContain('ScheduleOrderWhereInput')
    })

    it('should support ordering variables', () => {
      expect(GET_PRODUCTION_ORDERS).toContain('ProductionOrderOrderByInput')
      expect(GET_SCHEDULE_ORDERS).toContain('ScheduleOrderOrderByInput')
    })
  })

  describe('Field Coverage', () => {
    it('should include all required production order fields', () => {
      const requiredFields = [
        'quantity', 'completedQuantity', 'totalCooks', 'totalFermenters',
        'startDate', 'endDate', 'whiskeyType'
      ]
      
      requiredFields.forEach(field => {
        expect(GET_PRODUCTION_ORDERS).toContain(field)
      })
    })

    it('should include all required schedule order fields', () => {
      const requiredFields = [
        'estimatedStart', 'estimatedEnd', 'actualStart', 'actualEnd',
        'totalBarrels', 'totalProofGallons'
      ]
      
      requiredFields.forEach(field => {
        expect(GET_SCHEDULE_ORDERS).toContain(field)
      })
    })
  })
}) 