# Schedule Order Queue Index Update - PostgreSQL Transaction Error Fix

## Problem Description

The application was experiencing PostgreSQL transaction errors (code 25P02) when updating schedule order queue indices. The error "current transaction is aborted, commands ignored until end of transaction block" occurred when:

1. Multiple users tried to reorder queue items simultaneously
2. A previous operation within the same transaction failed
3. The code continued trying to execute subsequent operations after a transaction failure

## Root Cause Analysis

The original implementation had several issues:

1. **Individual Updates in Loop**: Used individual `update` operations in a loop within a transaction, making it vulnerable to race conditions
2. **Insufficient Input Validation**: Lacked proper validation before entering the transaction
3. **Poor Error Handling**: No specific handling for transaction failures or retry logic
4. **No Transaction Timeout**: Missing transaction timeout and maxWait settings
5. **Continued Execution After Failure**: Code continued executing operations after a transaction failure

## Solution Implemented

### 1. Enhanced Input Validation
- Moved validation logic outside the transaction to reduce transaction time
- Added comprehensive validation for queue ID existence and index ranges
- Early return for no-op cases (when newIndex equals currentIndex)

### 2. Improved Transaction Logic - Swap-Based Approach
- **Step 1**: Find the item currently at the target newIndex position
- **Step 2**: Temporarily set the moving item's index to null to avoid unique constraint violations
- **Step 3**: If there's an item at the target position, swap it to the old position; otherwise shift items to fill gaps
- **Step 4**: Set the moving item to its new position
- Used `ReadCommitted` isolation level for better concurrency
- Added transaction options with timeout (10s) and maxWait (5s) settings

### 3. Retry Logic with Exponential Backoff
- Implemented retry mechanism for transient failures (up to 3 attempts)
- Added exponential backoff delay between retries (1s, 2s, 4s)
- Intelligent retry logic that only retries for specific error types

### 4. Better Error Handling
- Added specific error handling for common PostgreSQL error codes:
  - `P2002`: Unique constraint violations
  - `25P02`: Aborted transactions
  - `P2025`: Record not found
  - `40001`: Serialization failures
  - `40P01`: Deadlock detection
- Provided user-friendly error messages instead of technical database errors
- Proper error logging with context for debugging

### 5. Performance Optimizations
- Eliminated bulk range updates that could cause constraint violations
- Used targeted swaps and minimal shifts to maintain queue integrity
- Minimized transaction time by moving validation outside
- Added proper error handling for monitoring operations to prevent cascade failures

## Code Changes

### Service Layer (`scheduleOrderQueue.service.ts`)

```typescript
// Added PrismaError interface for better type safety
interface PrismaError extends Error {
  code?: string;
  meta?: any;
}

// Enhanced updateScheduleOrderQueueIndex method with:
// - Input validation outside transaction
// - Retry logic with exponential backoff
// - Bulk operations instead of individual updates
// - Better error handling and user-friendly messages
```

### Controller Layer (`scheduleOrderQueue.controller.ts`)

```typescript
// Improved error handling with proper HTTP status codes:
// - BadRequestException for invalid inputs
// - ConflictException for concurrent modification errors
// - NotFoundException for missing resources
// - InternalServerErrorException for unexpected errors
```

## Benefits

1. **Reduced Transaction Conflicts**: Bulk operations minimize the chance of conflicts
2. **Better User Experience**: Clear error messages help users understand what went wrong
3. **Improved Reliability**: Retry logic handles transient failures automatically
4. **Better Performance**: Fewer database calls and optimized transaction handling
5. **Enhanced Debugging**: Comprehensive logging for troubleshooting

## Testing Recommendations

1. **Concurrent Access Testing**: Test multiple users reordering queue items simultaneously
2. **Error Scenario Testing**: Simulate database connection issues and transaction failures
3. **Performance Testing**: Verify that bulk operations perform better than individual updates
4. **Edge Case Testing**: Test boundary conditions like moving to first/last positions

## Monitoring

The solution includes enhanced logging that tracks:
- Successful queue index updates with attempt numbers
- Failed attempts with retry information
- Final error states with context for debugging
- Queue position monitoring failures (non-blocking)

## Future Improvements

1. **Optimistic Locking**: Consider implementing optimistic locking for even better concurrency
2. **Queue Validation**: Add periodic validation of queue integrity
3. **Metrics Collection**: Add metrics for monitoring transaction success rates
4. **Caching**: Consider caching queue state for read-heavy operations 