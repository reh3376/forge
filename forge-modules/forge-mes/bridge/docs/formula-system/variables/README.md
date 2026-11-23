# Variable Reference

Variables are named values injected into the expression context before evaluation. They represent production parameters -- grain loads, water volumes, mash bill compositions -- that formulas use to dynamically calculate BOM quantities.

## Variable Categories

### Base Variables

Core production inputs and system constants. See [Base Variables](./base-variables.md).

| Variable | Type | Description | Typical Value |
|----------|------|-------------|---------------|
| `grainLoad` | number | Total grain weight in lbs | 20,000 |
| `waterLoad` | number | Total water volume in gallons | 5,000 |
| `mashBill` | string | Mash bill code | `"70-21-00-09"` |
| `corn` | number | Corn percentage (0-100) | 70 |
| `rye` | number | Rye percentage (0-100) | 21 |
| `wheat` | number | Wheat percentage (0-100) | 0 |
| `malt` | number | Malt percentage (0-100) | 9 |
| `lbsPerBushel` | number | Constant: 56 | 56 |
| `gallonsPerBushel` | number | Constant: 4.5 | 4.5 |
| `metricTonDivisor` | number | Constant: 2205 | 2205 |

### Grain Character Variables

Dynamic grain type abbreviations and variety codes from the recipe's grain character configuration. See [Grain Character Variables](./grain-characters.md).

| Variable | Grain Type | Example |
|----------|------------|---------|
| `C` | Corn | `C = 70` |
| `R` | Rye | `R = 21` |
| `W` | Wheat | `W = 0` |
| `M` | Malt | `M = 9` |
| `Y` | Barley | `Y = 0` |
| `S` | Sorghum | `S = 0` |
| `B` | Buckwheat | `B = 0` |
| `O` | Oats | `O = 0` |
| `Z` | Other | `Z = 0` |
| `C1`-`C9` | Corn varieties | `C1 = 50`, `C2 = 20` |
| `R1`-`R9` | Rye varieties | `R1 = 21` |
| ... | (all types 1-9) | Percentage values |

## How Variables Are Resolved

The `ExpressionEngineService.buildContext()` method constructs the variable context:

1. **Base variables** are populated from the `LoadInputs` provided by the caller (grain load, water load).
2. **Mash bill parsing** extracts `corn`, `rye`, `wheat`, and `malt` from the `mashBill` string (e.g., `"70-21-00-09"` -> `corn=70, rye=21, wheat=0, malt=9`).
3. **Constants** (`lbsPerBushel`, `gallonsPerBushel`, `metricTonDivisor`) are always set to their fixed values.
4. **Grain character variables** are loaded from the recipe's `RecipeGrainCharacter` records and merged into the context using their abbreviation (and optional variety code).
5. Any **explicit overrides** in the partial context take precedence over parsed/computed values.

## Variable Scoping

Variables are scoped to a single formula evaluation. Each call to `evaluate()` builds a fresh context. There is no shared state between evaluations.

## Unknown Variable Handling

When the `validate()` method encounters a variable not in the known list, it adds a **warning** (not an error). This allows formulas to reference custom variables that may be provided at runtime.

During **evaluation**, referencing an undefined variable causes the expression to fail with an error.

## Case Sensitivity

Variable names are **case-sensitive**. `grainLoad` and `GrainLoad` are different variables. All base variables use camelCase. Grain character abbreviations use single uppercase letters.

## Related Pages

- [Base Variables](./base-variables.md) -- Detailed reference for production inputs and constants
- [Grain Character Variables](./grain-characters.md) -- Abbreviation system and variety codes
- [Expression Syntax](../expression-syntax.md) -- How variables are used in expressions
- [BOM Calculation Modes](../bom-calculation-modes.md) -- Which variables each mode requires
