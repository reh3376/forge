# Troubleshooting

Common errors, debugging strategies, and fixes for the formula system.

## Syntax Errors

### "parse error" or "unexpected token"

**Symptom:** Expression fails to parse with a syntax error.

**Common causes:**

| Problem | Incorrect | Correct |
|---------|-----------|---------|
| Missing operator | `grainLoad corn / 100` | `grainLoad * corn / 100` |
| Unbalanced parentheses | `ROUND(grainLoad / 56, 2` | `ROUND(grainLoad / 56, 2)` |
| Wrong string quotes | `IF(mashBill == '70-21', 1, 0)` | Use numeric comparisons instead |
| Double operators | `grainLoad ** 2` | `POW(grainLoad, 2)` or `grainLoad ^ 2` |
| Trailing comma | `ROUND(value, 2,)` | `ROUND(value, 2)` |

**Fix:** Use `validate()` to check expressions before saving. It returns detailed error messages pinpointing the syntax issue.

### "unexpected end of expression"

**Symptom:** Expression is incomplete.

**Common causes:**
- Empty expression string
- Expression ends with an operator: `grainLoad *`
- Incomplete ternary: `corn > 50 ? grainLoad * 0.7`

**Fix:** Ensure the expression is complete. Ternary expressions require both `?` and `:` branches.

## Variable Errors

### "undefined variable: X"

**Symptom:** Expression references a variable that is not in the context.

**Common causes:**
- Typo in variable name: `grainload` instead of `grainLoad` (case-sensitive)
- Using a grain character variable when no grain characters are loaded
- Referencing `waterLoad` when it was not provided in the inputs

**Fix:** Check variable names against the [Variable Reference](./variables/README.md). Variable names are case-sensitive.

| Wrong | Right |
|-------|-------|
| `grainload` | `grainLoad` |
| `waterload` | `waterLoad` |
| `lbsperbushel` | `lbsPerBushel` |
| `Corn` | `corn` |
| `c` | `C` (grain character) |

### "unknown variables" warning during validation

**Symptom:** Validation succeeds but warns about unknown variables.

**Cause:** The variable is not in the known variable list but may be provided at runtime.

**Impact:** This is a warning, not an error. The formula will still execute if the variable is provided in the context at evaluation time.

**Fix:** If the variable is intentional (e.g., a custom context variable), the warning can be ignored. If it is a typo, correct the variable name.

## Function Errors

### "unknown function: X"

**Symptom:** Formula calls a function that does not exist.

**Common causes:**
- Misspelled function name: `ROUNDS` instead of `ROUND`
- Using lowercase: `round(value, 2)` instead of `ROUND(value, 2)`
- Calling a dynamic function that has been deactivated
- Dynamic functions not yet loaded (service still initializing)

**Fix:** All built-in functions use UPPERCASE names. Check the [Function Reference](./functions/README.md). For dynamic functions, verify the `FormulaFunction` record is `isActive = true`.

### Wrong number of arguments

**Symptom:** Function returns unexpected results or errors.

**Common causes:**
- `ROUND(value)` -- missing decimals argument (defaults to 0, which may not be intended)
- `IF(condition, value)` -- missing falseValue (three arguments required)
- Dynamic functions called with more than 3 arguments

**Fix:** Check the function signature in the reference docs:

| Function | Required Args | Optional Args |
|----------|---------------|---------------|
| `IF` | 3 | none |
| `ROUND` | 1 | `decimals` (default 0) |
| `MIN` / `MAX` | 1+ | variadic |
| `BUSHELS` | 1 | none |
| Dynamic (EXPRESSION) | 1 (`x`) | `y`, `z` (default 0) |

## Calculation Mode Errors

### FORMULA_GRAIN returns 0

**Symptom:** Grain formula returns 0 instead of expected quantity.

**Possible causes:**
1. `grainLoad` is 0 or not provided.
2. `formulaMultiplier` is 0 or null.
3. `grainLoad` is negative (validation rejects non-positive values).

**Fix:** Verify that the Schedule Order has a valid `grainLoad` value. Check the BOM item's `formulaMultiplier` field.

**Diagnostic:** The formula logged in the result will show the calculation:
- `"0 * 0.7"` = grainLoad was 0
- `"20000 * 0"` = multiplier was 0
- `"error: grainLoad must be > 0 (was 0)"` = explicit validation failure

### FORMULA_WATER returns 0

**Symptom:** Water formula returns 0.

**Cause:** `waterLoad` was not provided in the `LoadInputs`.

**Fix:** Ensure the caller includes `waterLoad` in the load inputs. The formula logged will show `"waterLoad not provided"`.

### ENZYME_NORMALIZED returns 0

**Symptom:** Enzyme calculation returns 0.

**Possible causes:**
1. `mashBill` not provided.
2. BOM item's linked `item` has no `itemNumber`.
3. Enzyme not found in `EnzymeDosingService` configuration.
4. `EnzymeDosingService` returned null.

**Fix:** Check the formula logged in the result:
- `"mashBill not provided"` -- supply `mashBill` in inputs
- `"error: no itemNumber for enzyme lookup"` -- link the BOM item to an item with a valid `itemNumber`
- `"enzyme not found: ITEM123"` -- add enzyme configuration for the item number

### EXPRESSION returns 0

**Symptom:** Expression mode returns 0.

**Possible causes:**
1. No expression configured (neither `customExpression` nor `formulaLibraryId`).
2. Expression evaluation failed (see formula logged for error details).
3. The expression itself evaluates to 0 (correct behavior).

**Fix:** Check the formula logged in the result:
- `"error: no expression configured"` -- set `customExpression` or `formulaLibraryId`
- `"error: ..."` -- fix the expression based on the error message

## Recalculation Issues

### BOM quantities not updating

**Symptom:** Changing grain load or water load does not update BOM actual quantities.

**Possible causes:**
1. `recalculateOnLoadChange()` was not called.
2. No `ScheduleOrderRecipeInstance` exists for the schedule order.
3. No `RecipeBomItem` records linked to the instance's BOMs.

**Fix:** Verify the schedule order has an active recipe instance with BOM items. Check application logs for warnings from `BomCalculationService`.

### Audit log shows BOM_RECALCULATION but values unchanged

**Symptom:** Audit entry exists but quantities are the same.

**Cause:** The new loads produce the same quantities as the old loads (e.g., a STATIC item that does not depend on loads).

**Impact:** This is expected behavior. The system recalculates all items regardless, including STATIC ones.

## Dynamic Function Issues

### Dynamic function not available after creation

**Symptom:** A newly created `FormulaFunction` record is not callable in formulas.

**Possible causes:**
1. The function's `isActive` is `false`.
2. The `implementationType` is not `EXPRESSION` or `UNIT_CONVERSION`.
3. The service has not refreshed since the record was created.

**Fix:** Ensure `isActive = true` and correct `implementationType`. Restart the application or call `registerDynamicFunctions()`.

### UNIT_CONVERSION function not registered

**Symptom:** Log shows "Could not determine conversion rate for FUNCTION_NAME".

**Cause:** Neither `fromUnit.conversions` nor `toUnit.conversions` contains a mapping between the two units.

**Fix:** Add a conversion entry to one of the unit records' `conversions` JSON field. The entry key must be the other unit's `id`, `name`, or `abbreviation`.

## Performance Issues

### Formula evaluation is slow

**Symptom:** `executionTimeMs` in `FormulaExecutionLog` is high (>100ms).

**Possible causes:**
1. Formula Library lookup for each BOM item (database round-trip).
2. Grain character fetch for each evaluation.
3. Very complex expression with deep nesting.

**Fix:**
- Use `customExpression` instead of `formulaLibraryId` for frequently evaluated formulas.
- Pre-fetch grain characters once and pass them to all evaluations.
- Simplify deeply nested expressions.

## Debugging Checklist

1. **Check the formula log:** Every EXPRESSION evaluation is logged to `FormulaExecutionLog` with the expression, variables, result, and execution time.
2. **Use validation first:** Call `validate()` to catch syntax errors and unknown variables before evaluation.
3. **Preview before saving:** Use `previewCalculation()` to dry-run BOM calculations without database writes.
4. **Check the formula string in results:** The `formula` field in `CalculationResult` shows exactly what was computed.
5. **Inspect application logs:** `BomCalculationService` and `ExpressionEngineService` log warnings and errors with context.
6. **Verify context variables:** Log or inspect the full context object to ensure all expected variables are present and have correct values.

## Getting Help

- Review [Expression Syntax](./expression-syntax.md) for parser behavior.
- Check [Function Reference](./functions/README.md) for function signatures.
- Check [Variable Reference](./variables/README.md) for available variables.
- See [Common Patterns](./common-patterns.md) for working formula examples.
- For Formula Library test cases, use `FormulaLibraryService.runTests()` to validate formulas against known inputs/outputs.

## Related Pages

- [Expression Syntax](./expression-syntax.md)
- [Function Reference](./functions/README.md)
- [Variable Reference](./variables/README.md)
- [BOM Calculation Modes](./bom-calculation-modes.md)
- [Common Patterns](./common-patterns.md)
