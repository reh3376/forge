# Conversion Functions

Conversion functions translate between measurement units commonly used in whiskey production. These are built-in system functions with fixed conversion rates.

## Weight-to-Unit Conversions

### BUSHELS

Converts pounds to bushels. One bushel of grain = 56 lbs (USDA standard).

**Syntax:**

```
BUSHELS(lbs)
```

**Formula:** `lbs / 56`

**Examples:**

```
BUSHELS(20000)                     --> 357.142857
BUSHELS(grainLoad)                 --> 357.142857
BUSHELS(grainLoad * corn / 100)    --> BUSHELS(14000) --> 250.0
ROUND(BUSHELS(20000), 2)           --> 357.14
```

**Context:** Bushel measurement is standard for grain purchasing and recipe scaling in US whiskey production. A 20,000 lb grain load is approximately 357 bushels.

### METRIC_TONS

Converts pounds to metric tons.

**Syntax:**

```
METRIC_TONS(lbs)
```

**Formula:** `lbs / 2205`

**Examples:**

```
METRIC_TONS(20000)                 --> 9.0703...
METRIC_TONS(grainLoad)             --> 9.0703...
ROUND(METRIC_TONS(20000), 2)       --> 9.07
```

**Context:** Used for international reporting and bulk grain purchasing where metric units are required.

## Volume Conversions

### GALLONS_TO_LITERS

Converts US gallons to liters.

**Syntax:**

```
GALLONS_TO_LITERS(gallons)
```

**Formula:** `gallons * 3.78541`

**Examples:**

```
GALLONS_TO_LITERS(5000)            --> 18927.05
GALLONS_TO_LITERS(waterLoad)       --> 18927.05
ROUND(GALLONS_TO_LITERS(53.07), 2) --> 200.89
```

**Context:** Convert fermenter or barrel volumes for metric reporting. A standard barrel fill of 53.07 gallons is approximately 200.9 liters.

### LITERS_TO_GALLONS

Converts liters to US gallons.

**Syntax:**

```
LITERS_TO_GALLONS(liters)
```

**Formula:** `liters / 3.78541`

**Examples:**

```
LITERS_TO_GALLONS(18927.05)        --> 5000.0
LITERS_TO_GALLONS(200)             --> 52.83...
ROUND(LITERS_TO_GALLONS(1000), 2)  --> 264.17
```

## Weight Conversions

### KG_TO_LBS

Converts kilograms to pounds.

**Syntax:**

```
KG_TO_LBS(kg)
```

**Formula:** `kg * 2.20462`

**Examples:**

```
KG_TO_LBS(1000)                    --> 2204.62
KG_TO_LBS(9072)                    --> 20001.49 (~20000 lbs)
ROUND(KG_TO_LBS(100), 2)          --> 220.46
```

### LBS_TO_KG

Converts pounds to kilograms.

**Syntax:**

```
LBS_TO_KG(lbs)
```

**Formula:** `lbs / 2.20462`

**Examples:**

```
LBS_TO_KG(20000)                   --> 9071.85...
LBS_TO_KG(grainLoad)              --> 9071.85...
ROUND(LBS_TO_KG(20000), 2)        --> 9071.85
```

## Conversion Constants

These constants are also available as [variables](../variables/base-variables.md) for inline arithmetic:

| Constant | Variable Name | Value | Usage |
|----------|---------------|-------|-------|
| Lbs per bushel | `lbsPerBushel` | 56 | `grainLoad / lbsPerBushel` |
| Gallons per bushel | `gallonsPerBushel` | 4.5 | `bushels * gallonsPerBushel` |
| Metric ton divisor | `metricTonDivisor` | 2205 | `grainLoad / metricTonDivisor` |

Using the variable directly is equivalent to using the function:

```
BUSHELS(grainLoad)           --> 357.14
grainLoad / lbsPerBushel     --> 357.14
```

The function form is preferred for readability.

## Chaining Conversions

Convert grain load from pounds to kilograms, then to metric tons:

```
ROUND(LBS_TO_KG(grainLoad) / 1000, 3)
```
`LBS_TO_KG(20000) / 1000` = `9071.85 / 1000` = **9.072**

Convert water volume to liters and back (round-trip verification):

```
LITERS_TO_GALLONS(GALLONS_TO_LITERS(waterLoad))
```
Should return `waterLoad` (5000) with minimal floating-point drift.

## Custom Conversions

For conversion rates not covered by built-in functions, you can create [dynamic UNIT_CONVERSION functions](./dynamic-functions.md#unit-conversion-functions) through the database, or use inline arithmetic:

```
grainLoad * 0.000453592    // lbs to short tons (manual)
```

## Related Pages

- [Base Variables](../variables/base-variables.md) -- Conversion constants as variables
- [Math Functions](./math-functions.md) -- ROUND for cleaned-up output
- [Dynamic Functions](./dynamic-functions.md) -- Create custom unit conversions
- [Common Patterns](../common-patterns.md) -- Conversion in real formulas
