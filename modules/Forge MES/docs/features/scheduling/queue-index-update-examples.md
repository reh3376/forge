# Queue Index Update Logic Examples

## Swap-Based Approach

The new implementation uses a 4-step swap-based approach to avoid unique constraint violations when reordering queue items.

## Example Scenarios

### Scenario 1: Direct Swap (Item exists at target position)

**Initial State:**
```
Index 1: Item A
Index 2: Item B  
Index 3: Item C ← (moving to index 1)
Index 4: Item D
```

**Operation:** Move Item C from index 3 to index 1

**Steps:**
1. **Find target item**: Item A is at index 1
2. **Null moving item**: Item C index → null
3. **Swap**: Item A moves to index 3 (Item C's old position)
4. **Final placement**: Item C moves to index 1

**Final State:**
```
Index 1: Item C ← (moved here)
Index 2: Item B
Index 3: Item A ← (swapped here)
Index 4: Item D
```

### Scenario 2: Shift Down (No item at target position)

**Initial State:**
```
Index 1: Item A
Index 2: Item B
Index 3: Item C
Index 4: Item D ← (moving to index 2)
```

**Operation:** Move Item D from index 4 to index 2

**Steps:**
1. **Find target item**: No item at index 2 (Item B is there, but we're inserting between)
2. **Null moving item**: Item D index → null
3. **Shift items**: Items B and C shift down (B: 2→3, C: 3→4)
4. **Final placement**: Item D moves to index 2

**Final State:**
```
Index 1: Item A
Index 2: Item D ← (moved here)
Index 3: Item B ← (shifted down)
Index 4: Item C ← (shifted down)
```

### Scenario 3: Shift Up (Moving to lower index)

**Initial State:**
```
Index 1: Item A ← (moving to index 3)
Index 2: Item B
Index 3: Item C
Index 4: Item D
```

**Operation:** Move Item A from index 1 to index 3

**Steps:**
1. **Find target item**: Item C is at index 3
2. **Null moving item**: Item A index → null
3. **Swap**: Item C moves to index 1 (Item A's old position)
4. **Final placement**: Item A moves to index 3

**Final State:**
```
Index 1: Item C ← (swapped here)
Index 2: Item B
Index 3: Item A ← (moved here)
Index 4: Item D
```

## Benefits of This Approach

1. **No Constraint Violations**: By temporarily nulling the moving item, we avoid unique constraint conflicts
2. **Minimal Database Operations**: Only the necessary items are moved
3. **Atomic Operations**: All changes happen within a single transaction
4. **Clear Logic**: Easy to understand and debug
5. **Efficient**: Minimizes the number of database updates required

## Error Handling

The implementation includes comprehensive error handling for:

- **Unique Constraint Violations (P2002)**: Should not occur with this approach, but handled gracefully
- **Transaction Aborts (25P02)**: Automatic retry with exponential backoff
- **Record Not Found (P2025)**: Clear error message if item was deleted
- **Deadlocks (40001, 40P01)**: Automatic retry logic

## Transaction Safety

- Uses `ReadCommitted` isolation level for better concurrency
- Implements retry logic for transient failures
- Includes transaction timeouts to prevent hanging
- Comprehensive logging for debugging and monitoring 