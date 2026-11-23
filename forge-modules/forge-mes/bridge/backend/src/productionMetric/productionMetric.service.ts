import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EnumRecipeWhiskeyType, Prisma } from "@prisma/client";

export interface ResolvedMetric {
  name: string;
  value: number;
  unit?: string | null;
  whiskeyType?: EnumRecipeWhiskeyType | null;
  source: "exact" | "fallback";
}

@Injectable()
export class ProductionMetricService {
  private readonly logger = new Logger(ProductionMetricService.name);

  /** In-memory cache: category -> metrics */
  private metricCache = new Map<string, any[]>();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  private async ensureFreshCache(): Promise<void> {
    if (Date.now() - this.cacheLoadedAt > this.CACHE_TTL_MS) {
      await this.refreshCache();
    }
  }

  private async refreshCache(): Promise<void> {
    const metrics = await this.prisma.productionMetric.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    this.metricCache.clear();
    for (const m of metrics) {
      const key = m.category;
      if (!this.metricCache.has(key)) {
        this.metricCache.set(key, []);
      }
      this.metricCache.get(key)!.push(m);
    }
    this.cacheLoadedAt = Date.now();
    this.logger.debug(
      `Refreshed metric cache: ${metrics.length} metrics loaded`
    );
  }

  /**
   * Look up a metric value by name, optionally scoped to a whiskey type.
   * Falls back to unscoped (whiskeyType=null) if no type-specific value exists.
   */
  async getMetricValue(
    name: string,
    whiskeyType?: EnumRecipeWhiskeyType | null
  ): Promise<ResolvedMetric | null> {
    await this.ensureFreshCache();

    const allMetrics: any[] = [];
    for (const arr of this.metricCache.values()) {
      allMetrics.push(...arr);
    }

    // Try exact match with whiskey type first
    if (whiskeyType) {
      const exact = allMetrics.find(
        (m) => m.name === name && m.whiskeyType === whiskeyType
      );
      if (exact && exact.valueNumeric != null) {
        return {
          name: exact.name,
          value: exact.valueNumeric,
          unit: exact.unit,
          whiskeyType: exact.whiskeyType,
          source: "exact",
        };
      }
    }

    // Fall back to unscoped (whiskeyType = null)
    const fallback = allMetrics.find(
      (m) => m.name === name && m.whiskeyType == null
    );
    if (fallback && fallback.valueNumeric != null) {
      return {
        name: fallback.name,
        value: fallback.valueNumeric,
        unit: fallback.unit,
        whiskeyType: null,
        source: "fallback",
      };
    }

    return null;
  }

  async getMetricsByCategory(category: string) {
    await this.ensureFreshCache();
    return this.metricCache.get(category) || [];
  }

  /**
   * Resolve all yield-relevant metrics for a given whiskey type.
   * Returns a flat key→value map for use in expression contexts.
   */
  async resolveMetricsForWhiskeyType(
    whiskeyType?: EnumRecipeWhiskeyType | null
  ): Promise<Record<string, ResolvedMetric>> {
    const names = [
      "yield_pg_per_gu",
      "avg_barrel_fill_gallons",
      "cooks_per_fermenter",
      "lbs_per_bushel",
    ];

    const result: Record<string, ResolvedMetric> = {};
    for (const name of names) {
      const resolved = await this.getMetricValue(name, whiskeyType);
      if (resolved) {
        result[name] = resolved;
      }
    }
    return result;
  }

  async updateMetricValue(id: string, value: number, updatedBy?: string) {
    const existing = await this.prisma.productionMetric.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`ProductionMetric ${id} not found`);
    }

    const updated = await this.prisma.productionMetric.update({
      where: { id },
      data: {
        previousValue: existing.valueNumeric,
        valueNumeric: value,
        lastValueChange: new Date(),
        updatedBy,
      },
    });

    // Invalidate cache
    this.cacheLoadedAt = 0;
    return updated;
  }

  // --- Standard CRUD ---

  async findMany(args?: Prisma.ProductionMetricFindManyArgs) {
    return this.prisma.productionMetric.findMany(args);
  }

  async findOne(id: string) {
    return this.prisma.productionMetric.findUnique({ where: { id } });
  }

  async create(data: Prisma.ProductionMetricCreateInput) {
    const created = await this.prisma.productionMetric.create({ data });
    this.cacheLoadedAt = 0;
    return created;
  }

  async update(id: string, data: Prisma.ProductionMetricUpdateInput) {
    const updated = await this.prisma.productionMetric.update({
      where: { id },
      data,
    });
    this.cacheLoadedAt = 0;
    return updated;
  }

  async delete(id: string) {
    const deleted = await this.prisma.productionMetric.delete({
      where: { id },
    });
    this.cacheLoadedAt = 0;
    return deleted;
  }
}
