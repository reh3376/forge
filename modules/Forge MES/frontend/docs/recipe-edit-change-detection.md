# Recipe Edit Modal - Change Detection

## Overview

The Recipe Edit Modal now includes intelligent change detection that ensures the save button is only enabled when actual changes have been made to the recipe data.

## Features

### 1. Change Detection
- **Deep comparison**: The modal performs a deep comparison between the original recipe data and the current form data
- **Real-time updates**: Changes are detected immediately as the user modifies any field
- **Comprehensive coverage**: All recipe sections are monitored (details, BOM, parameters, mashing steps)
- **Type-safe comparison**: Proper type handling ensures numeric fields (like `cooksPerFerm`) are correctly compared

### 2. Save Button States
The save button has three distinct states:

1. **Disabled (No Changes)**: When no modifications have been made
   - Button is disabled
   - Status shows "No changes detected" in blue text
   
2. **Disabled (Invalid Form)**: When changes exist but validation fails
   - Button is disabled
   - Status shows "Please complete all required sections"
   
3. **Enabled (Ready to Save)**: When changes exist and form is valid
   - Button is enabled
   - Status shows "Ready to save changes" in green text

### 3. User Experience Improvements

#### Unsaved Changes Warning
- When attempting to close the modal with unsaved changes, a confirmation dialog appears
- Users can choose to discard changes or continue editing
- No warning is shown when closing without changes

#### Toast Notifications
- **Info toast**: Shown when attempting to save without changes
- **Error toast**: Shown for validation errors or save failures

## Implementation Details

### Change Detection Algorithm
```typescript
const hasChanges = useMemo(() => {
  const deepEqual = (obj1: unknown, obj2: unknown): boolean => {
    // Handles primitives, null/undefined
    if (obj1 === obj2) return true
    if (obj1 == null || obj2 == null) return obj1 === obj2
    if (typeof obj1 !== typeof obj2) return false
    if (typeof obj1 !== 'object') return obj1 === obj2
    
    // Handles arrays
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      if (obj1.length !== obj2.length) return false
      for (let i = 0; i < obj1.length; i++) {
        if (!deepEqual(obj1[i], obj2[i])) return false
      }
      return true
    }
    
    // Handles objects
    const record1 = obj1 as Record<string, unknown>
    const record2 = obj2 as Record<string, unknown>
    const keys1 = Object.keys(record1)
    const keys2 = Object.keys(record2)
    
    if (keys1.length !== keys2.length) return false
    for (const key of keys1) {
      if (!keys2.includes(key)) return false
      if (!deepEqual(record1[key], record2[key])) return false
    }
    return true
  }

  return !deepEqual(formData, originalData)
}, [formData, originalData])
```

### Type Handling for Recipe Details
To ensure proper change detection, especially for numeric fields, the modal includes type conversion logic:

```typescript
const handleDetailsChange = useCallback((data: Record<string, unknown>) => {
  // Ensure proper type conversion, especially for numbers
  const typedData = {
    ...data,
    cooksPerFerm: typeof data['cooksPerFerm'] === 'string' ? parseInt(data['cooksPerFerm']) || 1 : data['cooksPerFerm'],
    active: Boolean(data['active']),
    mashBill: data['mashBill'] && typeof data['mashBill'] === 'object' ? {
      corn: Number((data['mashBill'] as Record<string, unknown>)['corn']) || 0,
      rye: Number((data['mashBill'] as Record<string, unknown>)['rye']) || 0,
      wheat: Number((data['mashBill'] as Record<string, unknown>)['wheat']) || 0,
      maltedBarley: Number((data['mashBill'] as Record<string, unknown>)['maltedBarley']) || 0
    } : {
      corn: 0,
      rye: 0,
      wheat: 0,
      maltedBarley: 0
    }
  } as RecipeDetailsData
  
  setFormData(prev => ({ ...prev, details: typedData }))
}, [])
```

### State Management
- `originalData`: Stores the initial recipe data when the modal opens
- `formData`: Tracks the current state of the form
- `hasChanges`: Computed value indicating if changes exist
- `canSave`: Combines validation state and change detection

## Benefits

1. **Prevents Unnecessary API Calls**: Save button is disabled when no changes exist
2. **Improved User Experience**: Clear visual feedback about the current state
3. **Data Integrity**: Prevents accidental data loss with unsaved changes warning
4. **Performance**: Efficient deep comparison using memoization
5. **Type Safety**: Proper type handling prevents false negatives in change detection

## Troubleshooting

### Common Issues

#### Save Button Not Enabling After Changes
- **Cause**: Type mismatches between original and modified data
- **Solution**: The modal now includes proper type conversion for numeric fields
- **Example**: Changing `cooksPerFerm` from 4 to 5 now properly triggers change detection

#### False Positive Change Detection
- **Cause**: Inconsistent data types (e.g., string vs number)
- **Solution**: Type normalization ensures consistent comparison

## Usage

The change detection is automatic and requires no additional configuration. Simply use the `RecipeEditModal` component as before:

```tsx
<RecipeEditModal
  isOpen={isEditModalOpen}
  onClose={handleModalClose}
  recipe={selectedRecipe}
  onSave={handleRecipeSave}
/>
```

The modal will automatically track changes and manage the save button state accordingly, with proper handling for all data types including numeric fields like `cooksPerFerm`. 