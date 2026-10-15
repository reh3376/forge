// Common utility functions used across frontend and backend

/**
 * Format a date to a standard string format
 */
export function formatDate(date: Date | string, format: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('yyyy', String(year))
    .replace('MM', month)
    .replace('dd', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(deepClone) as unknown as T;
  }
  
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(
      ([key, value]) => [key, deepClone(value)]
    )
  ) as T;
}

/**
 * Safely access nested object properties
 */
export function getNestedValue<T>(
  obj: Record<string, any>, 
  path: string, 
  defaultValue: T
): T {
  const keys = path.split('.');
  let result: any = obj;
  
  for (const key of keys) {
    if (result === undefined || result === null || typeof result !== 'object') {
      return defaultValue;
    }
    result = result[key];
  }
  
  return (result === undefined ? defaultValue : result) as T;
}

// Add any other shared utility functions here 