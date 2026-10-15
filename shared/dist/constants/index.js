"use strict";
// Common constants used across frontend and backend
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_CODES = exports.SORT_DIRECTIONS = exports.DEFAULT_PAGINATION = exports.API_ENDPOINTS = void 0;
exports.API_ENDPOINTS = {
    RECIPES: '/api/recipes',
    USERS: '/api/users',
    AUTH: '/api/auth',
    CONFIGURATION: '/api/configuration',
};
exports.DEFAULT_PAGINATION = {
    PAGE: 1,
    LIMIT: 25,
};
exports.SORT_DIRECTIONS = {
    ASC: 'asc',
    DESC: 'desc',
};
exports.STATUS_CODES = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
};
// Add any other shared constants here 
