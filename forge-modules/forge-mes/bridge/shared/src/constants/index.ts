// Common constants used across frontend and backend

export const API_ENDPOINTS = {
  RECIPES: '/api/recipes',
  USERS: '/api/users',
  AUTH: '/api/auth',
  CONFIGURATION: '/api/configuration',
};

export const DEFAULT_PAGINATION = {
  PAGE: 1,
  LIMIT: 25,
};

export const SORT_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export const STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// Add any other shared constants here 