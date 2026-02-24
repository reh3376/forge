import { formatDate, API_ENDPOINTS, deepClone } from '@whk/shared';

// Test the formatDate function
const today = new Date();
const formattedDate = formatDate(today, 'yyyy-MM-dd');
console.log('Formatted date:', formattedDate);

// Test the API_ENDPOINTS constant
console.log('API Endpoints:', API_ENDPOINTS);

// Test the deepClone function
const originalObject = {
  user: {
    name: 'John',
    age: 30,
    preferences: {
      theme: 'dark',
      notifications: true
    }
  },
  settings: {
    language: 'en',
    timezone: 'UTC'
  }
};

const clonedObject = deepClone(originalObject);
console.log('Original object:', originalObject);
console.log('Cloned object:', clonedObject);

// Modify the cloned object to verify it's a deep clone
clonedObject.user.preferences.theme = 'light';
console.log('Modified cloned object:', clonedObject);
console.log('Original object after modification:', originalObject); 