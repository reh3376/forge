# Base Variables

Base variables are the core production inputs and constants available in every formula evaluation. They represent the fundamental parameters of a whiskey production cook.

## Production Input Variables

### grainLoad

**Type:** number
**Unit:** pounds (lbs)
**Required for:** FORMULA_GRAIN, ENZYME_NORMALIZED, EXPRESSION modes

The total grain weight for the cook. This is the primary scaling variable for most BOM calculations.

**Typical values:** 15,000 - 25,000 lbs

**Example:**

```
grainLoad * corn / 100
```
With `grainLoad = 20000`, `corn = 70`: result = **14,000 lbs** of corn.

### waterLoad

**Type:** number (optional)
**Unit:** gallons
**Required for:** FORMULA_WATER, EXPRESSION modes

The total water volume for the cook. Used for water-related BOM items like backset, process water, and chemical additions.

**Typical values:** 4,000 - 6,000 gallons

**Example:**

```
waterLoad * 0.25
```
With `waterLoad = 5000`: result = **1,250 gallons** of backset.

### mashBill

**Type:** string (optional)
**Format:** `"XX-XX-XX-XX"` (corn-rye-wheat-malt percentages)

The mash bill code string. When provided, the engine parses it to extract `corn`, `rye`, `wheat`, and `malt` percentage values.

**Examples:**
- `"70-21-00-09"` -- Bourbon (70% corn, 21% rye, 0% wheat, 9% malt)
- `"75-00-15-10"` -- Wheated bourbon (75% corn, 0% rye, 15% wheat, 10% malt)
- `"51-45-00-04"` -- High-rye bourbon (51% corn, 45% rye, 0% wheat, 4% malt)

The `mashBill` variable itself is a string and is rarely used directly in formulas. The parsed percentages (`corn`, `rye`, `wheat`, `malt`) are the values used in calculations.

## Grain Percentage Variables

These are derived from `mashBill` parsing or set directly in the context. All values range from 0 to 100 (percentage points, not decimals).

### corn

**Type:** number
**Range:** 0-100

Corn percentage from the mash bill. For bourbon, legally must be at least 51%.

**Example:**

```
grainLoad * corn / 100
```
With `grainLoad = 20000`, `corn = 70`: result = **14,000 lbs** of corn.

### rye

**Type:** number
**Range:** 0-100

Rye percentage from the mash bill.

**Example:**

```
grainLoad * rye / 100
```
With `grainLoad = 20000`, `rye = 21`: result = **4,200 lbs** of rye.

### wheat

**Type:** number
**Range:** 0-100

Wheat percentage from the mash bill. Zero for traditional bourbon; non-zero for wheated bourbon.

**Example:**

```
IF(wheat > 0, grainLoad * wheat / 100, 0)
```
With `wheat = 0`: result = **0** (no wheat in this recipe).

### malt

**Type:** number
**Range:** 0-100

Malt (malted barley) percentage from the mash bill. Typically 5-15% for enzymatic conversion.

**Example:**

```
grainLoad * malt / 100
```
With `grainLoad = 20000`, `malt = 9`: result = **1,800 lbs** of malt.

## Constants

Constants are always available and have fixed values. They cannot be overridden by context.

### lbsPerBushel

**Type:** number
**Value:** `56`

USDA standard pounds per bushel of grain. Used for bushel conversions.

**Example:**

```
grainLoad / lbsPerBushel
```
With `grainLoad = 20000`: result = **357.14 bushels**.

Equivalent to `BUSHELS(grainLoad)`.

### gallonsPerBushel

**Type:** number
**Value:** `4.5`

Standard mash water volume per bushel of grain (gallons per bushel).

**Example:**

```
(grainLoad / lbsPerBushel) * gallonsPerBushel
```
With `grainLoad = 20000`: `357.14 * 4.5` = **1,607.14 gallons** of mash water.

### metricTonDivisor

**Type:** number
**Value:** `2205`

Divisor to convert pounds to metric tons.

**Example:**

```
grainLoad / metricTonDivisor
```
With `grainLoad = 20000`: result = **9.07 metric tons**.

Equivalent to `METRIC_TONS(grainLoad)`.

## Context Building

The `buildContext()` method assembles variables in this order:

1. Set `grainLoad` from input (defaults to `0`).
2. Set `waterLoad` from input (optional, may be `undefined`).
3. Parse `mashBill` string into `corn`, `rye`, `wheat`, `malt`.
4. Set constants: `lbsPerBushel = 56`, `gallonsPerBushel = 4.5`, `metricTonDivisor = 2205`.
5. Merge [grain character variables](./grain-characters.md) if provided.
6. Apply any explicit overrides from the partial context.

Explicit values for `corn`, `rye`, `wheat`, or `malt` override values parsed from `mashBill`.

## Default Values

| Variable | Default if not provided |
|----------|------------------------|
| `grainLoad` | `0` |
| `waterLoad` | `undefined` (formulas using it will fail) |
| `corn` | `0` (or parsed from mashBill) |
| `rye` | `0` (or parsed from mashBill) |
| `wheat` | `0` (or parsed from mashBill) |
| `malt` | `0` (or parsed from mashBill) |
| `lbsPerBushel` | `56` (constant) |
| `gallonsPerBushel` | `4.5` (constant) |
| `metricTonDivisor` | `2205` (constant) |

## Related Pages

- [Grain Character Variables](./grain-characters.md) -- Extended grain type abbreviations
- [Variable Reference Index](./README.md) -- Full variable listing
- [BOM Calculation Modes](../bom-calculation-modes.md) -- Which variables each mode requires
- [Expression Syntax](../expression-syntax.md) -- Using variables in expressions
