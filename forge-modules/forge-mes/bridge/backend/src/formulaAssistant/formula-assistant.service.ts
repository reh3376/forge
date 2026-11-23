import { Injectable, Logger } from "@nestjs/common";
import {
  OpenRouterService,
  ChatCompletionMessageParam,
} from "../providers/openrouter/openrouter.service";
import { FormulaConfigService } from "../formulaConfig/formula-config.service";
import { FormulaLibraryService } from "../formulaLibrary/formula-library.service";
import { PrismaService } from "../prisma/prisma.service";
import { FormulaAssistantMessage } from "./dto/formula-assistant.dto";

@Injectable()
export class FormulaAssistantService {
  private readonly logger = new Logger(FormulaAssistantService.name);

  constructor(
    private readonly openRouter: OpenRouterService,
    private readonly formulaConfig: FormulaConfigService,
    private readonly formulaLibrary: FormulaLibraryService,
    private readonly prisma: PrismaService
  ) {}

  async chat(
    messages: FormulaAssistantMessage[]
  ): Promise<{ role: string; content: string }> {
    try {
      const systemPrompt = await this.buildSystemPrompt();

      const chatMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const content = await this.openRouter.createChatCompletion(chatMessages);
      return { role: "assistant", content };
    } catch (error) {
      this.logger.error(`Formula assistant chat error: ${error}`);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      return {
        role: "assistant",
        content: `I'm sorry, I encountered an error: ${message}. Please check that OPENROUTER_API_KEY is configured.`,
      };
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const [variables, functions, grainCharacters, formulas] = await Promise.all(
      [
        this.formulaConfig.getActiveVariables(),
        this.formulaConfig.getActiveFunctions(),
        this.prisma.grainCharacter.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
        }),
        this.formulaLibrary.search({ isActive: true }),
      ]
    );

    const variableList = variables
      .map(
        (v) =>
          `- \`${v.name}\` (${v.type || "number"}): ${
            v.description || v.displayName
          }${v.defaultValue ? ` [default: ${v.defaultValue}]` : ""}`
      )
      .join("\n");

    const functionList = functions
      .map(
        (f) =>
          `- \`${f.syntax || f.name + "()"}\`: ${f.description || ""}${
            f.exampleUsage ? ` — Example: ${f.exampleUsage}` : ""
          }`
      )
      .join("\n");

    const grainCharacterList = grainCharacters
      .map(
        (g) =>
          `- \`${g.abbreviation}\` = ${g.name}${
            g.varietyCode ? ` (variety: ${g.varietyCode})` : ""
          }`
      )
      .join("\n");

    const formulaList = formulas
      .slice(0, 20)
      .map(
        (f) =>
          `- **${f.name}** (${f.category || "General"}): \`${f.expression}\`${
            f.description ? ` — ${f.description}` : ""
          }`
      )
      .join("\n");

    return `You are a formula crafting assistant for the WhiskeyHouse Manufacturing Execution System (MES).
Your job is to help users create mathematical expressions for Bill of Materials (BOM) calculations in whiskey production.

## Expression Syntax Rules
- Expressions use the expr-eval library syntax (similar to Excel but without cell references)
- Prefix expressions with \`=\` (optional, it gets stripped automatically)
- Supported operators: \`+\`, \`-\`, \`*\`, \`/\`, \`%\` (modulo), \`^\` (power)
- Comparison: \`==\`, \`!=\`, \`<\`, \`>\`, \`<=\`, \`>=\`
- Logical: \`and\`, \`or\`, \`not\`
- Ternary: \`condition ? trueValue : falseValue\`
- Parentheses for grouping: \`(a + b) * c\`
- Function calls: \`FUNCTION_NAME(arg1, arg2)\`
- Variables are referenced by name: \`grainLoad * corn / 100\`

## Available Functions
${functionList || "No custom functions configured yet."}

### Built-in System Functions
- \`IF(condition, trueValue, falseValue)\`: Conditional evaluation
- \`AND(...args)\`: Returns true if all arguments are truthy
- \`OR(...args)\`: Returns true if any argument is truthy
- \`NOT(value)\`: Logical negation
- \`ROUND(value, decimals?)\`: Round to N decimal places (default 0)
- \`FLOOR(value)\`: Round down to nearest integer
- \`CEIL(value)\`: Round up to nearest integer
- \`ABS(value)\`: Absolute value
- \`MIN(...args)\`: Minimum of values
- \`MAX(...args)\`: Maximum of values
- \`POW(base, exponent)\`: Power/exponent
- \`SQRT(value)\`: Square root
- \`LOG(value)\`: Natural logarithm
- \`LOG10(value)\`: Base-10 logarithm
- \`EXP(value)\`: e raised to value
- \`BUSHELS(lbs)\`: Convert pounds to bushels (lbs / 56)
- \`METRIC_TONS(lbs)\`: Convert pounds to metric tons (lbs / 2205)
- \`GALLONS_TO_LITERS(gallons)\`: Convert gallons to liters (× 3.78541)
- \`LITERS_TO_GALLONS(liters)\`: Convert liters to gallons (÷ 3.78541)
- \`KG_TO_LBS(kg)\`: Convert kg to lbs (× 2.20462)
- \`LBS_TO_KG(lbs)\`: Convert lbs to kg (÷ 2.20462)

## Available Variables
${variableList || "No custom variables configured yet."}

### Built-in Base Variables
- \`grainLoad\`: Total grain weight in lbs (required for grain formulas)
- \`waterLoad\`: Total water volume in gallons (required for water formulas)
- \`mashBill\`: Mash bill code string (e.g., "70-21-00-09")
- \`corn\`: Corn percentage from mash bill (0-100)
- \`rye\`: Rye percentage from mash bill (0-100)
- \`wheat\`: Wheat percentage from mash bill (0-100)
- \`malt\`: Malt percentage from mash bill (0-100)
- \`lbsPerBushel\`: Constant = 56
- \`gallonsPerBushel\`: Constant = 4.5
- \`metricTonDivisor\`: Constant = 2205

## Grain Characters (abbreviation variables)
${grainCharacterList || "No grain characters configured yet."}

Grain abbreviations (C=Corn, R=Rye, W=Wheat, M=Malt, Y=Barley, S=Sorghum, B=Buckwheat, O=Oats, Z=Other) and variety codes (C1-C9, R1-R9, etc.) are available as percentage variables in expressions.

## Existing Formulas (for reference)
${formulaList || "No formulas created yet."}

## BOM Calculation Modes
- **STATIC**: Fixed quantity, no formula evaluation
- **FORMULA_GRAIN**: Expression evaluated with grain context (grainLoad, mash bill percentages)
- **FORMULA_WATER**: Expression evaluated with water context (waterLoad)
- **ENZYME_NORMALIZED**: Enzyme dosage normalized per unit of grain
- **EXPRESSION**: General-purpose expression evaluation

## Response Guidelines
1. **Always provide the complete expression** as a code block that can be directly copied
2. **Explain each part** of the formula briefly
3. **Suggest appropriate test cases** with sample inputs and expected outputs
4. **Mention which variables** the formula requires (grainLoad, waterLoad, etc.)
5. **Recommend the BOM calculation mode** (FORMULA_GRAIN, FORMULA_WATER, or EXPRESSION)
6. Keep formulas readable — use ROUND() for output values, add comments about units
7. If the user's request is ambiguous, ask clarifying questions about their production context`;
  }
}
