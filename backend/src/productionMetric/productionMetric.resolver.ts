import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import { ProductionMetricService } from "./productionMetric.service";
import { EnumRecipeWhiskeyType } from "../recipe/base/EnumRecipeWhiskeyType";
import {
  ProductionMetric,
  ProductionMetricCreateInput,
  ProductionMetricUpdateInput,
  ProductionMetricWhereUniqueInput,
} from "./dto/production-metric.types";

@Resolver(() => ProductionMetric)
export class ProductionMetricResolver {
  constructor(private readonly service: ProductionMetricService) {}

  @Query(() => [ProductionMetric], {
    name: "productionMetrics",
    description:
      "List production metrics, optionally filtered by category and whiskey type",
  })
  async findMany(
    @Args("category", { nullable: true }) category?: string,
    @Args("whiskeyType", { type: () => EnumRecipeWhiskeyType, nullable: true })
    whiskeyType?: EnumRecipeWhiskeyType
  ): Promise<ProductionMetric[]> {
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (whiskeyType) {
      where.OR = [{ whiskeyType }, { whiskeyType: null }];
    }
    return this.service.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }) as Promise<ProductionMetric[]>;
  }

  @Query(() => ProductionMetric, {
    name: "productionMetric",
    nullable: true,
    description: "Get a single production metric by ID",
  })
  async findOne(
    @Args("where") where: ProductionMetricWhereUniqueInput
  ): Promise<ProductionMetric | null> {
    return this.service.findOne(where.id) as Promise<ProductionMetric | null>;
  }

  @Mutation(() => ProductionMetric, {
    name: "createProductionMetric",
    description: "Create a new production metric",
  })
  async create(
    @Args("data") data: ProductionMetricCreateInput
  ): Promise<ProductionMetric> {
    return this.service.create({
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      category: data.category || "Yield",
      tags: data.tags || [],
      valueNumeric: data.valueNumeric,
      valueString: data.valueString,
      unit: data.unit,
      sourceType: data.sourceType as any,
      whiskeyType: data.whiskeyType as any,
      isSystem: data.isSystem ?? false,
    }) as Promise<ProductionMetric>;
  }

  @Mutation(() => ProductionMetric, {
    name: "updateProductionMetric",
    description: "Update an existing production metric",
  })
  async update(
    @Args("where") where: ProductionMetricWhereUniqueInput,
    @Args("data") data: ProductionMetricUpdateInput
  ): Promise<ProductionMetric> {
    const prismaData: any = {};
    if (data.displayName !== undefined)
      prismaData.displayName = data.displayName;
    if (data.description !== undefined)
      prismaData.description = data.description;
    if (data.category !== undefined) prismaData.category = data.category;
    if (data.tags !== undefined) prismaData.tags = data.tags;
    if (data.valueNumeric !== undefined)
      prismaData.valueNumeric = data.valueNumeric;
    if (data.valueString !== undefined)
      prismaData.valueString = data.valueString;
    if (data.unit !== undefined) prismaData.unit = data.unit;
    if (data.sourceType !== undefined) prismaData.sourceType = data.sourceType;
    if (data.whiskeyType !== undefined)
      prismaData.whiskeyType = data.whiskeyType;
    if (data.isActive !== undefined) prismaData.isActive = data.isActive;
    if (data.updatedBy !== undefined) prismaData.updatedBy = data.updatedBy;

    return this.service.update(
      where.id,
      prismaData
    ) as Promise<ProductionMetric>;
  }

  @Mutation(() => ProductionMetric, {
    name: "updateProductionMetricValue",
    description: "Update a metric numeric value (tracks previous value)",
  })
  async updateValue(
    @Args("id") id: string,
    @Args("value") value: number,
    @Args("updatedBy", { nullable: true }) updatedBy?: string
  ): Promise<ProductionMetric> {
    return this.service.updateMetricValue(
      id,
      value,
      updatedBy
    ) as Promise<ProductionMetric>;
  }

  @Mutation(() => ProductionMetric, {
    name: "deleteProductionMetric",
    description: "Delete a production metric",
  })
  async delete(
    @Args("where") where: ProductionMetricWhereUniqueInput
  ): Promise<ProductionMetric> {
    return this.service.delete(where.id) as Promise<ProductionMetric>;
  }
}
