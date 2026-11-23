# BOM Calculation Modes

Every `RecipeBomItem` has a `calculationMode` field that determines how its quantity is computed. The `BomCalculationService` dispatches to the appropriate calculation strategy based on this mode.

## Mode Overview

| Mode | Description | Primary Input | Requires |
|------|-------------|---------------|----------|
| `STATIC` | Fixed quantity, no formula | None | `quantity` field on BOM item |
| `FORMULA_GRAIN` | Grain-based ratio/conversion | `grainLoad` | `formulaType`, `formulaMultiplier` |
| `FORMULA_WATER` | Water-based ratio | `waterLoad` | `formulaType`, `formulaMultiplier` |
| `ENZYME_NORMALIZED` | Enzyme dosing from mash bill | `grainLoad`, `mashBill` | Linked item with `itemNumber` |
| `EXPRESSION` | General-purpose formula | Varies | `customExpression` or `formulaLibraryId` |

## STATIC

The simplest mode. The BOM item's `quantity` field is used directly, with no computation.

**When to use:** Fixed-amount ingredients that do not vary with load size (e.g., a single bag of yeast, a fixed chemical charge).

**Configuration:**

| Field | Value |
|-------|-------|
| `calculationMode` | `STATIC` |
| `quantity` | The fixed amount |

**Behavior:**

```
result = bomItem.quantity
```

**Example:** A yeast pitch of exactly 25 lbs regardless of grain load:

| Field | Value |
|-------|-------|
| `quantity` | `25` |
| `calculationMode` | `STATIC` |

Result: **25 lbs**

## FORMULA_GRAIN

Calculates quantity as a function of the grain load. Supports multiple formula types through the `formulaType` field.

**When to use:** Grain ingredients that scale proportionally with load size -- corn, rye, malt, water-per-bushel ratios.

**Configuration:**

| Field | Value |
|-------|-------|
| `calculationMode` | `FORMULA_GRAIN` |
| `formulaType` | `SIMPLE_RATIO` or `WATER_PER_BUSHEL` |
| `formulaMultiplier` | The ratio/multiplier value |

**Validation:** Fails gracefully with `quantity = 0` if `grainLoad` is missing or not positive.

### SIMPLE_RATIO

Multiplies grain load by the multiplier. Used for grain percentage ingredients.

```
result = grainLoad * formulaMultiplier
```

**Example:** Corn at 70% of a 20,000 lb grain load:

| Field | Value |
|-------|-------|
| `formulaType` | `SIMPLE_RATIO` |
| `formulaMultiplier` | `0.70` |

Calculation: `20000 * 0.70` = **14,000 lbs**

Formula logged: `"20000 * 0.7"`

### WATER_PER_BUSHEL

Converts grain load to bushels, then multiplies by a gallons-per-bushel ratio. Used for mash water calculations.

```
bushels = grainLoad / 56
result = bushels * formulaMultiplier
```

**Example:** Mash water at 4.5 gallons per bushel:

| Field | Value |
|-------|-------|
| `formulaType` | `WATER_PER_BUSHEL` |
| `formulaMultiplier` | `4.5` |

Calculation: `(20000 / 56) * 4.5` = `357.14 * 4.5` = **1,607.14 gallons**

Formula logged: `"(20000 / 56) * 4.5"`

## FORMULA_WATER

Calculates quantity as a function of the water load. Used for water-derived ingredients.

**When to use:** Backset, process water additions, water treatment chemicals dosed per gallon.

**Configuration:**

| Field | Value |
|-------|-------|
| `calculationMode` | `FORMULA_WATER` |
| `formulaType` | `BACKSET_PERCENTAGE` (or default) |
| `formulaMultiplier` | The ratio/multiplier value |

**Validation:** Returns `quantity = 0` with warning if `waterLoad` is not provided.

### BACKSET_PERCENTAGE

Multiplies water load by the multiplier. Used for backset (stillage) additions.

```
result = waterLoad * formulaMultiplier
```

**Example:** Backset at 25% of water load:

| Field | Value |
|-------|-------|
| `formulaType` | `BACKSET_PERCENTAGE` |
| `formulaMultiplier` | `0.25` |

Calculation: `5000 * 0.25` = **1,250 gallons**

Formula logged: `"5000 * 0.25"`

## ENZYME_NORMALIZED

Calculates enzyme dosage using the `EnzymeDosingService`, which normalizes dosing based on the mash bill composition.

**When to use:** Enzyme additions where dosage depends on the specific grain types and ratios in the mash bill.

**Configuration:**

| Field | Value |
|-------|-------|
| `calculationMode` | `ENZYME_NORMALIZED` |
| Linked `item` | Must have a valid `itemNumber` for enzyme lookup |

**Required inputs:** `grainLoad` and `mashBill`.

**Behavior:**

1. Looks up the enzyme by `itemNumber` in the enzyme configuration.
2. Calls `EnzymeDosingService.calculateNormalizedEnzymeDosing(mashBill, itemNumber)`.
3. Returns `ratio * grainLoad`, rounded to 2 decimal places.

**Example:** Alpha-amylase enzyme for a bourbon mash bill:

```
EnzymeDosingService returns ratio = 0.00035
result = 0.00035 * 20000 = 7.00 lbs
```

Formula logged: `"0.00035 * 20000 (Alpha-Amylase)"`

**Error handling:**
- Missing `mashBill`: returns 0 with warning.
- Missing `itemNumber`: returns 0 with error message.
- Enzyme not found in configuration: returns 0 with "enzyme not found" formula.
- Service error: returns 0 with error message.

## EXPRESSION

The most flexible mode. Evaluates a user-defined expression using the full expression engine with all variables and functions.

**When to use:** Complex calculations that cannot be expressed as simple ratios -- conditional logic, multi-variable formulas, custom function calls.

**Configuration:**

| Field | Value |
|-------|-------|
| `calculationMode` | `EXPRESSION` |
| `customExpression` | Inline expression string (option 1) |
| `formulaLibraryId` | Reference to a Formula Library entry (option 2) |

If both are set, `formulaLibraryId` takes precedence.

**Behavior:**

1. Resolves the expression string from either `formulaLibraryId` or `customExpression`.
2. Builds the expression context with `grainLoad`, `waterLoad`, `mashBill`, grain percentages, and grain characters.
3. If `recipeId` is provided, fetches grain characters from the recipe's `RecipeGrainCharacter` records.
4. Evaluates via `ExpressionEngineService.evaluate()`.
5. Logs the execution to `FormulaExecutionLog` for audit trail.
6. Returns the result rounded to 2 decimal places.

**Example -- inline expression:**

| Field | Value |
|-------|-------|
| `customExpression` | `ROUND(grainLoad * corn / 100 / lbsPerBushel, 2)` |

With `grainLoad = 20000`, `corn = 70`:
`ROUND(20000 * 70 / 100 / 56, 2)` = `ROUND(250, 2)` = **250.00 bushels**

**Example -- formula library reference:**

| Field | Value |
|-------|-------|
| `formulaLibraryId` | `"abc123"` (references formula with expression `grainLoad * C / 100`) |

The expression is fetched from the library, allowing reuse across multiple BOM items.

**Error handling:**
- No expression configured: returns 0 with "no expression configured" error.
- Expression evaluation failure: returns 0 with the error message.
- All executions are logged to `FormulaExecutionLog` regardless of success/failure.

## Calculation Lifecycle

### Initial Calculation

When a Schedule Order Recipe Instance is created, `calculateInitialBomQuantities()` iterates all BOM items and creates `RecipeBomActual` records with calculated quantities.

### Recalculation on Load Change

When grain load or water load changes, `recalculateOnLoadChange()`:

1. Fetches all BOM items for the schedule order.
2. Recalculates each item using the new loads.
3. Updates existing `RecipeBomActual` records (or creates new ones).
4. Updates `lastCalculatedAt` timestamps.
5. Logs an audit entry with old and new quantities.

### Preview

`previewCalculation()` runs the same calculations without writing to the database, returning a list of `BomItemCalculation` results for UI preview.

## Choosing a Mode

| Scenario | Recommended Mode |
|----------|-----------------|
| Fixed ingredient amount | `STATIC` |
| Grain ingredient by percentage | `FORMULA_GRAIN` (SIMPLE_RATIO) |
| Water volume from bushel calculation | `FORMULA_GRAIN` (WATER_PER_BUSHEL) |
| Backset or water-derived ingredient | `FORMULA_WATER` |
| Enzyme with mash-bill-dependent dosage | `ENZYME_NORMALIZED` |
| Complex multi-variable formula | `EXPRESSION` |
| Conditional logic needed | `EXPRESSION` |
| Formula reuse across recipes | `EXPRESSION` (with Formula Library) |

## Related Pages

- [Expression Syntax](./expression-syntax.md) -- For EXPRESSION mode formulas
- [Function Reference](./functions/README.md) -- Available functions in expressions
- [Variable Reference](./variables/README.md) -- Available variables in context
- [Common Patterns](./common-patterns.md) -- Real-world examples for each mode
