# Common Patterns

This page collects real-world formula patterns organized by category. All examples use typical bourbon production values: `grainLoad = 20000`, `corn = 70`, `rye = 21`, `wheat = 0`, `malt = 9`, `waterLoad = 5000`.

## Grain Calculations

### Individual Grain Weights

Calculate the weight of each grain component from the mash bill:

```
grainLoad * corn / 100       --> 20000 * 70 / 100 = 14000 lbs corn
grainLoad * rye / 100        --> 20000 * 21 / 100 = 4200 lbs rye
grainLoad * malt / 100       --> 20000 * 9 / 100  = 1800 lbs malt
```

Using grain character variables:

```
grainLoad * C / 100          --> 14000 lbs corn
grainLoad * R / 100          --> 4200 lbs rye
grainLoad * M / 100          --> 1800 lbs malt
```

### Multi-Variety Grain

When a recipe uses two corn varieties (C1 = 50%, C2 = 20%):

```
grainLoad * C1 / 100         --> 20000 * 50 / 100 = 10000 lbs (variety 1)
grainLoad * C2 / 100         --> 20000 * 20 / 100 = 4000 lbs (variety 2)
```

### Bushel Conversion

Convert grain load to bushels:

```
ROUND(BUSHELS(grainLoad), 2)
--> ROUND(20000 / 56, 2)
--> ROUND(357.142857, 2)
--> 357.14 bushels
```

Convert a specific grain's weight to bushels:

```
ROUND(BUSHELS(grainLoad * corn / 100), 2)
--> ROUND(BUSHELS(14000), 2)
--> ROUND(250.0, 2)
--> 250.00 bushels of corn
```

### Metric Tons

Report grain load in metric tons:

```
ROUND(METRIC_TONS(grainLoad), 3)
--> ROUND(20000 / 2205, 3)
--> ROUND(9.0703, 3)
--> 9.070 metric tons
```

### Whole-Bushel Rounding

Round up to the nearest full bushel for grain ordering:

```
CEIL(grainLoad * corn / 100 / lbsPerBushel) * lbsPerBushel
--> CEIL(14000 / 56) * 56
--> CEIL(250.0) * 56
--> 250 * 56
--> 14000 lbs
```

For non-even amounts:

```
CEIL(grainLoad * rye / 100 / lbsPerBushel) * lbsPerBushel
--> CEIL(4200 / 56) * 56
--> CEIL(75.0) * 56
--> 75 * 56
--> 4200 lbs
```

## Water Calculations

### Mash Water from Bushels

Calculate mash water using gallons-per-bushel ratio:

```
ROUND((grainLoad / lbsPerBushel) * gallonsPerBushel, 1)
--> ROUND((20000 / 56) * 4.5, 1)
--> ROUND(357.14 * 4.5, 1)
--> ROUND(1607.14, 1)
--> 1607.1 gallons
```

### Backset Volume

Calculate backset (thin stillage returned to the cooker) at 25%:

```
waterLoad * 0.25
--> 5000 * 0.25
--> 1250.0 gallons
```

### Cook Water (Total Water Minus Backset)

```
waterLoad - (waterLoad * 0.25)
--> 5000 - 1250
--> 3750.0 gallons of fresh cook water
```

Or equivalently:

```
waterLoad * 0.75
--> 3750.0 gallons
```

### Water in Liters

For metric reporting:

```
ROUND(GALLONS_TO_LITERS(waterLoad), 1)
--> ROUND(5000 * 3.78541, 1)
--> ROUND(18927.05, 1)
--> 18927.1 liters
```

### Water-to-Grain Ratio

```
ROUND(waterLoad / grainLoad, 4)
--> ROUND(5000 / 20000, 4)
--> ROUND(0.25, 4)
--> 0.25 gallons per lb
```

## Enzyme Dosing

### Simple Ratio-Based Dosing

Enzyme at a fixed rate per pound of grain:

```
grainLoad * 0.00035
--> 20000 * 0.00035
--> 7.0 lbs of enzyme
```

### Corn-Adjusted Enzyme Dosing

Higher corn content requires more alpha-amylase:

```
IF(corn > 60,
  grainLoad * 0.00040,
  grainLoad * 0.00030
)
--> corn = 70 > 60, so:
--> 20000 * 0.00040
--> 8.0 lbs
```

### Tiered Enzyme Dosing

Three-tier dosing based on corn percentage:

```
IF(corn > 70,
  grainLoad * 0.00045,
  IF(corn > 50,
    grainLoad * 0.00035,
    grainLoad * 0.00025
  )
)
--> corn = 70, not > 70, check second:
--> corn = 70 > 50, so:
--> 20000 * 0.00035
--> 7.0 lbs
```

### Enzyme with Min/Max Bounds

Ensure enzyme stays within operational limits:

```
ROUND(MIN(MAX(grainLoad * 0.00035, 5), 15), 2)
--> grainLoad * 0.00035 = 7.0
--> MAX(7.0, 5) = 7.0  (above minimum)
--> MIN(7.0, 15) = 7.0  (below maximum)
--> ROUND(7.0, 2) = 7.00
```

## Conditional Logic

### Mash Bill Type Detection

Determine recipe characteristics and adjust accordingly:

```
IF(corn >= 51 and corn < 80 and rye > 0,
  grainLoad * 0.0004,
  IF(corn >= 51 and wheat > 0,
    grainLoad * 0.00035,
    grainLoad * 0.0003
  )
)
```

This uses:
- Higher rate for traditional bourbon (corn 51-79%, has rye)
- Medium rate for wheated bourbon (corn 51%+, has wheat)
- Lower rate for other recipes

### Skip Ingredient for Certain Mash Bills

Return zero for wheated bourbons (no rye):

```
IF(rye == 0, 0, grainLoad * rye / 100)
--> rye = 21 != 0, so:
--> 20000 * 21 / 100
--> 4200 lbs
```

### High-Rye Grain Handling

Use a different grain supplier ratio when rye exceeds 30%:

```
IF(R > 30,
  grainLoad * R / 100 * 1.05,
  grainLoad * R / 100
)
```
The 1.05 multiplier accounts for higher waste in high-rye milling.

## Chemical and Additive Calculations

### pH Adjustment Chemical

Dose sulfuric acid based on water volume with a minimum:

```
MAX(waterLoad * 0.0008, 2.5)
--> MAX(5000 * 0.0008, 2.5)
--> MAX(4.0, 2.5)
--> 4.0 gallons
```

### Anti-Foam Agent

Scale with grain load, capped at a maximum:

```
MIN(grainLoad * 0.0001, 5)
--> MIN(20000 * 0.0001, 5)
--> MIN(2.0, 5)
--> 2.0 lbs
```

### Nutrient Addition (Multi-Factor)

Dose yeast nutrient based on both grain load and malt percentage:

```
ROUND(grainLoad * 0.0002 * (1 + (10 - malt) / 20), 2)
--> 20000 * 0.0002 * (1 + (10 - 9) / 20)
--> 4.0 * (1 + 0.05)
--> 4.0 * 1.05
--> 4.20 lbs
```

Lower malt content means less natural enzyme, so more nutrient is added.

## Combined Multi-Step Formulas

### Complete Water Calculation

Total mash water including backset and adjustments:

```
ROUND(
  (grainLoad / lbsPerBushel) * gallonsPerBushel
  - waterLoad * 0.25
  + IF(corn > 60, 50, 0),
  1
)
--> (20000 / 56) * 4.5 - 5000 * 0.25 + 50
--> 1607.14 - 1250.0 + 50
--> 407.1 gallons of fresh water needed
```

### Grain with Moisture Correction

If you have a custom `GRAIN_ADJ` function that adjusts for moisture:

```
ROUND(GRAIN_ADJ(grainLoad * corn / 100, 12), 0)
--> GRAIN_ADJ(14000, 12) = 14000 * (1 - 12/100) = 12320
--> ROUND(12320, 0)
--> 12320 lbs (dry weight at 12% moisture)
```

### KG Reporting for International Export

```
ROUND(LBS_TO_KG(grainLoad * corn / 100), 1)
--> LBS_TO_KG(14000)
--> 14000 / 2.20462
--> 6350.3 kg
```

## Pattern Summary

| Pattern | Formula Template |
|---------|-----------------|
| Grain by percentage | `grainLoad * PERCENT / 100` |
| Grain in bushels | `ROUND(BUSHELS(grainLoad * PERCENT / 100), 2)` |
| Water from bushels | `ROUND((grainLoad / lbsPerBushel) * gallonsPerBushel, 1)` |
| Backset | `waterLoad * BACKSET_RATE` |
| Simple dosing | `grainLoad * RATE` |
| Bounded dosing | `ROUND(MIN(MAX(grainLoad * RATE, MIN_VAL), MAX_VAL), 2)` |
| Conditional dosing | `IF(condition, grainLoad * RATE_HIGH, grainLoad * RATE_LOW)` |
| Metric conversion | `ROUND(METRIC_TONS(grainLoad), 3)` |
| Volume conversion | `ROUND(GALLONS_TO_LITERS(waterLoad), 1)` |

## Related Pages

- [Expression Syntax](./expression-syntax.md) -- Operator and syntax reference
- [Function Reference](./functions/README.md) -- All available functions
- [Variable Reference](./variables/README.md) -- All available variables
- [BOM Calculation Modes](./bom-calculation-modes.md) -- Mode selection guide
- [Troubleshooting](./troubleshooting.md) -- When formulas don't work as expected
