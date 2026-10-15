# Grain Character Variables

Grain character variables provide a flexible system for referencing grain type percentages in formulas. They use single-letter abbreviations for grain types, with optional numeric variety codes for differentiating specific grain varieties within a type.

## How Grain Characters Work

Each recipe can have multiple `RecipeGrainCharacter` records, each linking a `GrainCharacter` (with an abbreviation and optional variety code) to a percentage. During expression evaluation, these are injected into the variable context so formulas can reference them directly.

For example, if a recipe uses two corn varieties at different percentages:
- Corn variety 1 (yellow #2) at 50%: variable `C1 = 50`
- Corn variety 2 (white) at 20%: variable `C2 = 20`
- Total corn (aggregate): variable `C = 70`

## Grain Type Abbreviations

| Abbreviation | Grain Type | Common Usage |
|:---:|------------|--------------|
| `C` | Corn | Primary grain in bourbon (51%+ required) |
| `R` | Rye | Flavoring grain; dominant in rye whiskey |
| `W` | Wheat | Softer flavor; used in wheated bourbon |
| `M` | Malt | Malted barley for enzymatic conversion |
| `Y` | Barley | Unmalted barley |
| `S` | Sorghum | Specialty/gluten-free distilling |
| `B` | Buckwheat | Specialty distilling |
| `O` | Oats | Specialty distilling |
| `Z` | Other | Catch-all for uncommon grain types |

## Variety Codes

Each grain type supports variety codes `1` through `9`, allowing up to 9 distinct varieties per grain type:

| Variable | Description |
|----------|-------------|
| `C1` | Corn variety 1 (e.g., Yellow Dent #2) |
| `C2` | Corn variety 2 (e.g., White Corn) |
| `C3` | Corn variety 3 |
| ... | ... |
| `C9` | Corn variety 9 |
| `R1` | Rye variety 1 (e.g., Abruzzi Rye) |
| `R2` | Rye variety 2 (e.g., Elbon Rye) |
| ... | ... |

The full set of recognized variables is:

```
C, C1, C2, C3, C4, C5, C6, C7, C8, C9
R, R1, R2, R3, R4, R5, R6, R7, R8, R9
W, W1, W2, W3, W4, W5, W6, W7, W8, W9
M, M1, M2, M3, M4, M5, M6, M7, M8, M9
Y, Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8, Y9
S, S1, S2, S3, S4, S5, S6, S7, S8, S9
B, B1, B2, B3, B4, B5, B6, B7, B8, B9
O, O1, O2, O3, O4, O5, O6, O7, O8, O9
Z, Z1, Z2, Z3, Z4, Z5, Z6, Z7, Z8, Z9
```

That is 9 grain types with 10 variables each (base + 9 varieties) = **90 total grain character variables**.

## Values

All grain character variables represent **percentage values from 0 to 100**. They are NOT decimal fractions.

| Expression | Meaning |
|------------|---------|
| `C = 70` | 70% corn |
| `R1 = 21` | 21% rye (variety 1) |
| `M = 9` | 9% malt |

To use them in weight calculations, divide by 100:

```
grainLoad * C / 100      --> 20000 * 70 / 100 = 14000 lbs of corn
grainLoad * R1 / 100     --> 20000 * 21 / 100 = 4200 lbs of rye variety 1
```

## Grain Characters vs. Legacy Variables

The system supports two ways to reference grain percentages:

| Approach | Variables | Source |
|----------|-----------|--------|
| **Legacy** | `corn`, `rye`, `wheat`, `malt` | Parsed from `mashBill` string |
| **Grain Characters** | `C`, `R`, `W`, `M`, `Y`, `S`, `B`, `O`, `Z` (+ varieties) | Loaded from `RecipeGrainCharacter` records |

**Key differences:**

- Legacy variables only support 4 grain types (corn, rye, wheat, malt).
- Grain characters support 9 grain types with variety codes.
- Grain characters are loaded from the recipe's grain character configuration, not parsed from a code string.
- Both can coexist in the same formula context.

**Recommendation:** Use grain character variables (`C`, `R`, `M`, etc.) for new formulas. Legacy variables are maintained for backward compatibility.

## Context Population

Grain character variables are populated by `buildContext()`:

1. The caller provides a `GrainCharacterInput[]` array.
2. Each entry has `abbreviation` (e.g., `"C"`), optional `varietyCode` (e.g., `"1"`), and `percentage`.
3. The engine constructs the variable name by concatenating abbreviation + varietyCode (e.g., `"C" + "1"` = `"C1"`).
4. If no varietyCode is provided, just the abbreviation is used (e.g., `"C"`).
5. These are merged into the expression context alongside base variables.

In the `BomCalculationService`, grain characters are fetched automatically from the recipe:

```
RecipeGrainCharacter -> GrainCharacter.abbreviation + GrainCharacter.varietyCode -> percentage
```

## Examples

### Standard Bourbon (70-21-00-09)

| Variable | Value | Source |
|----------|-------|--------|
| `C` | 70 | Corn (total) |
| `R` | 21 | Rye (total) |
| `M` | 9 | Malt (total) |

```
grainLoad * C / 100       --> 14000 lbs corn
grainLoad * R / 100       --> 4200 lbs rye
grainLoad * M / 100       --> 1800 lbs malt
```

### Multi-Variety Corn Recipe

| Variable | Value | Description |
|----------|-------|-------------|
| `C1` | 50 | Yellow Dent #2 |
| `C2` | 20 | White Corn |
| `R1` | 21 | Abruzzi Rye |
| `M1` | 9 | 6-Row Malted Barley |

```
grainLoad * C1 / 100      --> 10000 lbs yellow dent
grainLoad * C2 / 100      --> 4000 lbs white corn
(C1 + C2)                 --> 70 (total corn percentage)
```

### Conditional by Grain Type

Adjust enzyme dosage based on whether the recipe contains barley:

```
IF(Y > 0, grainLoad * 0.002, grainLoad * 0.003)
```

If barley is present, use a lower enzyme rate (barley provides natural enzymes).

## Validation

When the expression engine validates a formula, grain character variables are included in the known variable list. Referencing `C`, `R1`, `W3`, etc. will not produce unknown-variable warnings. However, referencing `X` or `Q` (not valid grain abbreviations) will trigger a warning.

## Related Pages

- [Base Variables](./base-variables.md) -- Legacy grain percentages and constants
- [Variable Reference Index](./README.md) -- Full variable listing
- [Common Patterns](../common-patterns.md) -- Formulas using grain characters
