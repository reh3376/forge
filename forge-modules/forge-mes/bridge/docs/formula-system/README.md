# Formula System

The WhiskeyHouse MES Formula System provides a powerful expression engine for dynamically calculating Bill of Materials (BOM) quantities during whiskey production. Instead of hard-coding ingredient amounts, formulas adapt to changing grain loads, water volumes, and mash bill compositions in real time.

## How It Works

1. **Recipes** define master BOM items with calculation modes (static, formula-based, or expression-based).
2. When a **Schedule Order** is created, the system evaluates each BOM item's formula against the order's grain load, water load, and mash bill.
3. The **Expression Engine** (powered by [expr-eval](https://github.com/nicolewhite/expr-eval)) parses and evaluates formulas using production context variables and built-in functions.
4. Results are stored as `RecipeBomActual` records, with full audit trails and execution logs.

## Quick Start

### Basic Formula

A simple grain-percentage formula for corn in a 20,000 lb grain load:

```
grainLoad * corn / 100
```

With `grainLoad = 20000` and `corn = 70`, this yields **14,000 lbs**.

### Using Functions

Round the result of a bushel conversion:

```
ROUND(BUSHELS(grainLoad), 2)
```

With `grainLoad = 20000`, this yields `ROUND(357.142857, 2)` = **357.14 bushels**.

### Conditional Logic

Adjust water ratio based on grain type:

```
=IF(corn > 50, waterLoad * 0.85, waterLoad * 0.90)
```

The leading `=` prefix is optional and is automatically stripped before evaluation.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Expression Engine** | Core evaluation service using the `expr-eval` library |
| **Variables** | Named values injected into formulas (e.g., `grainLoad`, `corn`) |
| **Functions** | Built-in and user-defined operations (e.g., `ROUND`, `BUSHELS`) |
| **Calculation Modes** | How a BOM item determines its quantity (STATIC, FORMULA_GRAIN, EXPRESSION, etc.) |
| **Formula Library** | Versioned, reusable formula definitions stored in the database |
| **Grain Characters** | Dynamic grain type abbreviations (C, R, W, M, etc.) with variety codes |

## Architecture

```
ExpressionEngineService
  |-- Parser (expr-eval)
  |-- System Functions (IF, ROUND, BUSHELS, etc.)
  |-- Dynamic Functions (loaded from FormulaFunction table)
  |
BomCalculationService
  |-- calculateItemQuantity() --> dispatches by calculation mode
  |-- recalculateOnLoadChange() --> updates all BOM actuals when loads change
  |-- previewCalculation() --> dry-run without database writes
  |
FormulaLibraryService
  |-- Versioned formula storage
  |-- Test case management
  |-- Execution logging and usage stats
```

## Documentation Index

### Syntax and Language

- [Expression Syntax](./expression-syntax.md) -- Operators, precedence, and parser behavior

### Function Reference

- [Function Reference Index](./functions/README.md)
- [Conditional Functions](./functions/conditional-functions.md) -- IF, AND, OR, NOT
- [Math Functions](./functions/math-functions.md) -- ROUND, FLOOR, CEIL, ABS, MIN, MAX, POW, SQRT, LOG, LOG10, EXP
- [Conversion Functions](./functions/conversion-functions.md) -- BUSHELS, METRIC_TONS, GALLONS_TO_LITERS, etc.
- [Dynamic Functions](./functions/dynamic-functions.md) -- User-created EXPRESSION and UNIT_CONVERSION functions

### Variable Reference

- [Variable Reference Index](./variables/README.md)
- [Base Variables](./variables/base-variables.md) -- grainLoad, waterLoad, mashBill, grain percentages, constants
- [Grain Character Variables](./variables/grain-characters.md) -- C, R, W, M, Y, S, B, O, Z and variety codes

### Calculation Modes and Patterns

- [BOM Calculation Modes](./bom-calculation-modes.md) -- STATIC, FORMULA_GRAIN, FORMULA_WATER, ENZYME_NORMALIZED, EXPRESSION
- [Common Patterns](./common-patterns.md) -- Real-world formula examples for grain, water, enzyme, and conditional calculations
- [Troubleshooting](./troubleshooting.md) -- Common errors, debugging tips, and fixes

## Source Code

| File | Purpose |
|------|---------|
| `src/expressionEngine/expression-engine.service.ts` | Core expression parser, built-in functions, variable context |
| `src/recipeBom/bom-calculation.service.ts` | BOM quantity calculation dispatch and recalculation |
| `src/formulaLibrary/formula-library.service.ts` | Versioned formula CRUD, test cases, execution logs |
| `src/formulaAssistant/formula-assistant.service.ts` | AI-assisted formula creation and suggestions |
| `src/recipe/enzyme.dosing.ts` | Enzyme dosage normalization service |
