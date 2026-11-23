# BOM Calculator Service Requirements

## Overview
The BOM Calculator Service extends the base BOM service to provide functionality for calculating actual BOM quantities from a recipe BOM based on specific production parameters.

## Input Parameters
- **Recipe ID**: ID of the recipe
- **Recipe BOM ID**: (Optional) ID of the specific recipe BOM to use. If not provided, defaults to the highest revision of recipe BOM associated with the recipe
- **Container Type**: Type of container being used
- **Container Item ID**: (Optional) ID of the container item
- **Order Quantity**: Number of units to be produced
- **Total Grain Weight**: Total weight of grain to be used (in lbs)
- **Total Cooks**: Number of cook cycles required
- **Total Fermenters**: Number of fermenters required

## Calculation Logic

### Grain Components
```
Actual Quantity = Recipe BOM Quantity * Total Grain Weight * Cook Count / Finished Good Quantity
```

### Additives and Yeast
```
Actual Quantity = Recipe BOM Quantity * Cook Count / Finished Good Quantity
```
Note: For yeast, fermenter count may be used instead of cook count depending on the process.

### Water and Backset
```
Actual Quantity = Recipe BOM Quantity * Cook Count
```

## Output
The service returns a calculated BOM with actual quantities for production, which includes:
- Item details (ID, name, number, etc.)
- Calculated quantity based on the input parameters
- Original recipe BOM quantity
- Units of measure

## API Endpoint
```
POST /api/boms/calculate
```

## Use Cases
- Creating production orders with accurate material requirements
- Estimating material needs for upcoming production runs
- Planning inventory requirements based on scheduled production 