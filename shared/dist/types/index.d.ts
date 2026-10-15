export interface PaginationParams {
    page: number;
    limit: number;
}
export interface SortParams {
    field: string;
    direction: 'asc' | 'desc';
}
export interface FilterParams {
    field: string;
    value: string | number | boolean | null;
    operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
}
export interface QueryParams {
    pagination?: PaginationParams;
    sort?: SortParams;
    filters?: FilterParams[];
}
export * from './mashbill';
