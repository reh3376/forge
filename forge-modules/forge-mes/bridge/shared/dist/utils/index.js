"use strict";
// Common utility functions used across frontend and backend
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDate = formatDate;
exports.deepClone = deepClone;
exports.getNestedValue = getNestedValue;
/**
 * Format a date to a standard string format
 */
function formatDate(date, format = 'yyyy-MM-dd') {
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
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(deepClone);
    }
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, deepClone(value)]));
}
/**
 * Safely access nested object properties
 */
function getNestedValue(obj, path, defaultValue) {
    const keys = path.split('.');
    let result = obj;
    for (const key of keys) {
        if (result === undefined || result === null || typeof result !== 'object') {
            return defaultValue;
        }
        result = result[key];
    }
    return (result === undefined ? defaultValue : result);
}
// Add any other shared utility functions here 
