// EnzymeDosingService Class

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EnzymeConfigurationService } from "../enzymeConfiguration/enzymeConfiguration.service";
import { SystemConfigurationService } from "../systemConfiguration/systemConfiguration.service";

interface Enzyme {
  category: string;
  name: string;
  dosePerMetricTon: number;
  instructions: string;
  itemId?: string;
}

@Injectable()
export class EnzymeDosingService implements OnModuleInit {
  private readonly logger = new Logger(EnzymeDosingService.name);

  // Default values for system configurations
  private static readonly DEFAULT_METRIC_TON_DIVISOR = 2205;
  private static readonly DEFAULT_CACHE_TTL = 3600000; // 1 hour in milliseconds

  // Cache for enzyme configurations
  private enzymeCache: Enzyme[] = [];
  private enzymeMappingCache: { [key: string]: string } = {};
  private lastCacheUpdate = 0;

  // Configurable parameters (will be loaded from SystemConfigurationService)
  private metricTonDivisor = EnzymeDosingService.DEFAULT_METRIC_TON_DIVISOR;
  private cacheTTL = EnzymeDosingService.DEFAULT_CACHE_TTL;

  constructor(
    private readonly enzymeConfigurationService: EnzymeConfigurationService,
    private readonly systemConfigurationService: SystemConfigurationService
  ) {}

  async onModuleInit() {
    await this.loadSystemConfigurations();
    await this.refreshEnzymeCache();
  }

  /**
   * Load system configurations for enzyme dosing
   */
  private async loadSystemConfigurations(): Promise<void> {
    try {
      this.logger.log("Loading system configurations for enzyme dosing");

      // Load metric ton divisor configuration
      this.metricTonDivisor =
        await this.systemConfigurationService.getConfigOrDefault<number>(
          "ENZYME_METRIC_TON_DIVISOR",
          EnzymeDosingService.DEFAULT_METRIC_TON_DIVISOR
        );

      // Load cache TTL configuration (convert from minutes to milliseconds)
      const cacheTTLMinutes =
        await this.systemConfigurationService.getConfigOrDefault<number>(
          "ENZYME_CACHE_TTL_MINUTES",
          60 // Default 60 minutes
        );
      this.cacheTTL = cacheTTLMinutes * 60 * 1000; // Convert to milliseconds

      this.logger.log(
        `Loaded system configurations - Metric Ton Divisor: ${this.metricTonDivisor}, Cache TTL: ${this.cacheTTL}ms`
      );
    } catch (error) {
      this.logger.warn(
        "Failed to load system configurations, using defaults",
        error
      );
      // Keep default values if configuration loading fails
    }
  }

  /**
   * Refresh the enzyme cache from the database
   */
  private async refreshEnzymeCache(): Promise<void> {
    try {
      this.logger.log("Refreshing enzyme cache from database");

      const configurations =
        await this.enzymeConfigurationService.getActiveConfigurationsForDosing();

      this.enzymeCache = configurations.map((config) => ({
        category: config.category,
        name: config.name,
        dosePerMetricTon: config.dosePerMetricTon,
        instructions: config.instructions,
        itemId: config.itemId,
      }));

      // Build dynamic enzyme mapping based on database configurations
      this.enzymeMappingCache = this.buildEnzymeMapping(this.enzymeCache);

      this.lastCacheUpdate = Date.now();
      this.logger.log(
        `Successfully cached ${this.enzymeCache.length} enzyme configurations`
      );
    } catch (error) {
      this.logger.error("Failed to refresh enzyme cache", error);

      // Fallback to hardcoded values if database is unavailable
      if (this.enzymeCache.length === 0) {
        this.logger.warn("Using fallback hardcoded enzyme configurations");
        this.enzymeCache = this.getFallbackEnzymeList();
        this.enzymeMappingCache = this.getFallbackEnzymeMapping();
      }
    }
  }

  /**
   * Build enzyme mapping from database configurations
   */
  private buildEnzymeMapping(enzymes: Enzyme[]): { [key: string]: string } {
    const mapping: { [key: string]: string } = {};

    enzymes.forEach((enzyme) => {
      const name = enzyme.name.toLowerCase();

      // Create mappings based on common patterns
      if (name.includes("termamyl")) {
        mapping["termamyl"] = enzyme.name;
      } else if (name.includes("liquozyme")) {
        mapping["liquozyme"] = enzyme.name;
      } else if (name.includes("amylex")) {
        mapping["amylex"] = enzyme.name;
      } else if (name.includes("alphalase")) {
        mapping["alphalase"] = enzyme.name;
      } else if (name.includes("saczyme")) {
        mapping["saczyme"] = enzyme.name;
      } else if (name.includes("diazyme")) {
        mapping["diazyme"] = enzyme.name;
        if (name.includes("ssf2")) {
          mapping["diazyme2"] = enzyme.name;
        }
      } else if (name.includes("viscoferm")) {
        mapping["viscoferm"] = enzyme.name;
      } else if (name.includes("laminex")) {
        mapping["laminex"] = enzyme.name;
      }

      // Also add the full name as a mapping
      mapping[name.replace(/\s+/g, "").toLowerCase()] = enzyme.name;
    });

    return mapping;
  }

  /**
   * Get enzyme list with cache refresh if needed
   */
  private async getEnzymeList(): Promise<Enzyme[]> {
    const now = Date.now();

    if (now - this.lastCacheUpdate > this.cacheTTL) {
      await this.refreshEnzymeCache();
    }

    return this.enzymeCache;
  }

  /**
   * Get enzyme mapping with cache refresh if needed
   */
  private async getEnzymeMapping(): Promise<{ [key: string]: string }> {
    const now = Date.now();

    if (now - this.lastCacheUpdate > this.cacheTTL) {
      await this.refreshEnzymeCache();
    }

    return this.enzymeMappingCache;
  }

  /**
   * Fallback hardcoded enzyme list for when database is unavailable
   */
  private getFallbackEnzymeList(): Enzyme[] {
    return [
      {
        category: "Liquifaction",
        name: "Termamyl SC DS",
        dosePerMetricTon: 0.13,
        instructions: "with water/backset before grain",
      },
      {
        category: "Liquifaction",
        name: "Liquozyme PRO HP DI",
        dosePerMetricTon: 0.185,
        instructions: "with water/backset before grain",
      },
      {
        category: "Liquifaction",
        name: "Amylex 6T",
        dosePerMetricTon: 0.25,
        instructions: "with water/backset before grain",
      },
      {
        category: "Liquifaction",
        name: "Alphalase THP",
        dosePerMetricTon: 1.0,
        instructions: "with water/backset before grain",
      },
      {
        category: "Saccharification",
        name: "Saczyme Pro 1.5X",
        dosePerMetricTon: 0.6,
        instructions: "at 152 degrees F on crash",
      },
      {
        category: "Saccharification",
        name: "Saczyme Yield",
        dosePerMetricTon: 0.3,
        instructions: "at 152 degrees F on crash",
      },
      {
        category: "Saccharification",
        name: "Diazyme SSF",
        dosePerMetricTon: 0.3,
        instructions: "at 152 degrees F on crash",
      },
      {
        category: "Saccharification",
        name: "Diazyme SSF2",
        dosePerMetricTon: 0.8,
        instructions: "at 152 degrees F on crash",
      },
      {
        category: "Viscosity",
        name: "Viscoferm",
        dosePerMetricTon: 0.1,
        instructions: "at 152 degrees F on crash",
      },
      {
        category: "Viscosity",
        name: "Laminex C2K",
        dosePerMetricTon: 0.1,
        instructions: "at 152 degrees F on crash",
      },
    ];
  }

  /**
   * Fallback hardcoded enzyme mapping
   */
  private getFallbackEnzymeMapping(): { [key: string]: string } {
    return {
      termamyl: "Termamyl SC DS",
      liquozyme: "Liquozyme PRO HP DI",
      amylex: "Amylex 6T",
      alphalase: "Alphalase THP",
      saczyme: "Saczyme Pro 1.5X",
      diazyme: "Diazyme SSF2",
      diazyme2: "Diazyme SSF2",
      viscoferm: "Viscoferm",
      laminex: "Laminex C2K",
    };
  }

  /**
   * Calculates enzyme dosing based on total grain load and mash bill.
   * @param totalGrainLoadLbs Total grain load in pounds.
   * @param mashBill Mash bill string (e.g., "70-21-00-09").
   * @param enzymeName Name of the enzyme type.
   * @returns Dosage information including dose and instructions.
   */
  public async calculateEnzymeDosing(
    totalGrainLoadLbs: number,
    mashBill: string,
    enzymeName: string
  ): Promise<{ dose: number; instructions: string } | null> {
    // Check if the enzyme is Citric and skip processing if so
    if (enzymeName.toLowerCase() === "citric") {
      this.logger.log("Citric enzyme detected. Skipping dosing calculation.");
      return null;
    }

    const mashBillParts = mashBill.split("-").map((part) => parseFloat(part));
    if (mashBillParts.length !== 4 && mashBillParts.length !== 5) {
      throw new Error(
        "Mash bill must have four or five components separated by dashes."
      );
    }
    const [corn, rye, wheat, malt, specialty = 0] = mashBillParts;
    const cornQuantity =
      (corn * totalGrainLoadLbs) / 100 / this.metricTonDivisor;
    const ryeQuantity = (rye * totalGrainLoadLbs) / 100 / this.metricTonDivisor;
    const wheatQuantity =
      (wheat * totalGrainLoadLbs) / 100 / this.metricTonDivisor;
    const maltQuantity =
      (malt * totalGrainLoadLbs) / 100 / this.metricTonDivisor;
    const totalGrainMetricTons = totalGrainLoadLbs / this.metricTonDivisor;

    // Get enzyme configurations from cache/database
    const enzymeList = await this.getEnzymeList();
    const enzymeMapping = await this.getEnzymeMapping();

    // Normalize the enzymeName to lowercase for case-insensitive mapping
    const normalizedEnzymeName = enzymeName.toLowerCase();
    const fullEnzymeName = enzymeMapping[normalizedEnzymeName];
    if (!fullEnzymeName) {
      throw new Error(
        `Enzyme "${enzymeName}" is not recognized in the mapping.`
      );
    }

    const enzyme = enzymeList.find(
      (e) => e.name.toLowerCase() === fullEnzymeName.toLowerCase()
    );
    if (!enzyme) {
      throw new Error(`Enzyme "${fullEnzymeName}" not found.`);
    }
    let dose;
    if (
      enzyme.category === "Liquifaction" ||
      enzyme.category === "Saccharification"
    ) {
      dose =
        Math.round(enzyme.dosePerMetricTon * totalGrainMetricTons * 100) / 100;
    } else if (enzyme.category === "Viscosity") {
      const sanitizedTotalGrainLoadLbs = totalGrainLoadLbs
        .toString()
        .replace(/\n|\r/g, "");
      this.logger.log(
        `Total grain load: ${sanitizedTotalGrainLoadLbs}, Corn: ${cornQuantity}, Rye: ${ryeQuantity}, Wheat: ${wheatQuantity}, Malt: ${maltQuantity}. Enzyme does per MT: ${enzyme.dosePerMetricTon}`
      );
      // Laminex/Viscoferm new formula (applies to Viscosity category only):
      // dose = (Rye% or Wheat%) * (1.5 * Total Metric Tons + 9e-16)
      // - Rye/Wheat are percentages from the mash bill (use Rye if present else Wheat)
      // - Total Metric Tons is totalGrainLoadLbs / 2205
      const grainFraction = ((rye > 0 ? rye : wheat) || 0) / 100;
      const viscosityBase = 1.5 * totalGrainMetricTons + 9e-16;
      dose = Math.round(grainFraction * viscosityBase * 100) / 100;
    }
    if (dose) {
      return {
        dose: parseFloat(dose.toFixed(3)),
        instructions: enzyme.instructions,
      };
    } else {
      throw new Error("Failed to calculate enzyme dose");
    }
  }

  /**
   * Calculates normalized enzyme dosing as a unitless ratio based on mash bill using itemId.
   * The result is a ratio of (lbs enzyme / lbs grain) that can be multiplied by
   * actual grain weight during production.
   *
   * @param mashBill Mash bill string (e.g., "70-21-00-09").
   * @param itemId Item ID of the enzyme.
   * @returns Normalized dosage ratio and instructions.
   */
  public async calculateNormalizedEnzymeDosingByItemId(
    mashBill: string,
    itemId: string
  ): Promise<{
    ratio: number;
    instructions: string;
    enzymeName: string;
    category: string;
  } | null> {
    try {
      // Get enzyme configurations from cache/database
      const enzymeList = await this.getEnzymeList();

      // Find enzyme by itemId
      const enzyme = enzymeList.find((e) => e.itemId === itemId);

      if (!enzyme) {
        this.logger.warn(
          `Enzyme with itemId "${itemId}" not found in enzyme list`
        );
        return null;
      }

      // Check if the enzyme is Citric and skip processing if so
      if (enzyme.name.toLowerCase().includes("citric")) {
        this.logger.log("Citric enzyme detected. Skipping dosing calculation.");
        return null;
      }

      // Parse mash bill
      const mashBillParts = mashBill.split("-").map((part) => parseFloat(part));
      if (mashBillParts.length !== 4) {
        throw new Error(
          "Mash bill must have four components separated by dashes."
        );
      }

      const [corn, rye, wheat, malt] = mashBillParts;

      // Use a reference grain load of 1 metric ton (2205 lbs) for calculating the ratio
      const referenceGrainLoadLbs = this.metricTonDivisor;
      const totalGrainMetricTons =
        referenceGrainLoadLbs / this.metricTonDivisor; // This equals 1

      // Calculate dose directly using the enzyme configuration we found
      let dose: number;

      if (
        enzyme.category === "LIQUIFACTION" ||
        enzyme.category === "SACCHARIFICATION"
      ) {
        dose =
          Math.round(enzyme.dosePerMetricTon * totalGrainMetricTons * 100) /
          100;
      } else if (enzyme.category === "VISCOSITY") {
        // For viscosity enzymes, calculate based on rye/wheat content
        const cornQuantity =
          (corn * referenceGrainLoadLbs) / 100 / this.metricTonDivisor;
        const ryeQuantity =
          (rye * referenceGrainLoadLbs) / 100 / this.metricTonDivisor;
        const wheatQuantity =
          (wheat * referenceGrainLoadLbs) / 100 / this.metricTonDivisor;

        this.logger.log(
          `Viscosity enzyme calculation - Total grain load: ${referenceGrainLoadLbs}, Corn: ${cornQuantity}, Rye: ${ryeQuantity}, Wheat: ${wheatQuantity}. Enzyme dose per MT: ${enzyme.dosePerMetricTon}`
        );

        // Use rye or wheat quantity for viscosity calculation (whichever is higher)
        const viscosityFactor = Math.max(ryeQuantity, wheatQuantity);
        dose =
          Math.round(
            enzyme.dosePerMetricTon *
              totalGrainMetricTons *
              viscosityFactor *
              100
          ) / 100;
      } else {
        throw new Error(`Unknown enzyme category: ${enzyme.category}`);
      }

      if (!dose || dose <= 0) {
        throw new Error("Failed to calculate enzyme dose");
      }

      // Convert to a unitless ratio (lbs enzyme / lbs grain)
      const ratio = dose / referenceGrainLoadLbs;

      return {
        ratio: parseFloat(ratio.toFixed(6)), // Higher precision for the ratio
        instructions: enzyme.instructions,
        enzymeName: enzyme.name,
        category: enzyme.category,
      };
    } catch (error) {
      // Log the error for debugging but return null for unknown enzymes
      this.logger.warn(
        `Failed to calculate normalized enzyme dosing for itemId "${itemId}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Calculates normalized enzyme dosing as a unitless ratio based on mash bill.
   * The result is a ratio of (lbs enzyme / lbs grain) that can be multiplied by
   * actual grain weight during production.
   *
   * @param mashBill Mash bill string (e.g., "70-21-00-09").
   * @param enzymeName Name of the enzyme type.
   * @returns Normalized dosage ratio and instructions.
   */
  public async calculateNormalizedEnzymeDosing(
    mashBill: string,
    enzymeName: string
  ): Promise<{ ratio: number; instructions: string } | null> {
    // Check if the enzyme is Citric and skip processing if so
    if (enzymeName.toLowerCase() === "citric") {
      this.logger.log("Citric enzyme detected. Skipping dosing calculation.");
      return null;
    }

    try {
      // Use a reference grain load of 1 metric ton (2205 lbs) for calculating the ratio
      const referenceGrainLoadLbs = this.metricTonDivisor;

      // Calculate absolute dosing using the reference grain load
      const absoluteDosing = await this.calculateEnzymeDosing(
        referenceGrainLoadLbs,
        mashBill,
        enzymeName
      );

      if (!absoluteDosing) {
        return null;
      }

      // Convert to a unitless ratio (lbs enzyme / lbs grain)
      const ratio = absoluteDosing.dose / referenceGrainLoadLbs;

      return {
        ratio: parseFloat(ratio.toFixed(6)), // Higher precision for the ratio
        instructions: absoluteDosing.instructions,
      };
    } catch (error) {
      // Log the error for debugging but return null for unknown enzymes
      this.logger.warn(
        `Failed to calculate normalized enzyme dosing for "${enzymeName}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }
}
