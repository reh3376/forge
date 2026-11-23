import { useQuery } from '@apollo/client'
import { CUSTOMER_QUERIES } from '../api/graphql-queries'
import { apolloClient } from '../api/unified-graphql-client'

export interface Customer {
  id: string
  name: string
  customerCode: string
}

export function useCustomers() {
  const { data, loading, error } = useQuery(CUSTOMER_QUERIES.GET_CUSTOMERS, {
    client: apolloClient,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  })

  // Process and validate customer data
  const customers = (data?.customers || []).filter((customer: Customer) => {
    // Log problematic customers for debugging
    if (!customer.customerCode || customer.customerCode.trim() === '') {
      console.warn('Customer with invalid customerCode found:', customer)
      return false
    }
    return true
  })

  // Log duplicate customerCodes for debugging
  const customerCodes = customers.map((c: Customer) => c.customerCode)
  const duplicates = customerCodes.filter((code: string, index: number) => customerCodes.indexOf(code) !== index)
  if (duplicates.length > 0) {
    console.warn('Duplicate customerCodes found:', duplicates)
  }

  return {
    customers,
    customersLoading: loading,
    customersError: error,
  }
} 