import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductionOrderServiceBase } from "./base/productionOrder.service.base";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhMessageBrokerTopics } from "../rabbitmq/topics";
import {
  Prisma,
  PrismaClient,
  EnumProductionOrderStatus,
  EnumScheduleOrderStatus,
  EnumUnitProcedureName,
  EnumProductionOrderContainerType,
} from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { CreateProductionOrderWithScheduleDto } from "./dto/create-production-order-with-schedule.dto";
import { CreateProductionOrderWizardDto } from "./dto/create-production-order-wizard.dto";
import { CreateProductionOrderWizardInput } from "./dto/create-production-order-wizard-graphql.input";
import {
  OrderValidationService,
  ProductionOrderValidationData,
} from "../order-validation/order-validation.service";
import { ContainerItemService } from "./container-item.service";
import { ScheduleOrderGroupingService } from "../scheduleOrder/schedule-order-grouping.service";
import { ScheduleOrderService } from "../scheduleOrder/scheduleOrder.service";
import { MashBillParser } from "../recipe/mashbill-parser";
import { MqttDomainPublisherService } from "../mqttDomainPublisher/mqttDomainPublisher.service";

// Type for Prisma transaction client
type PrismaTransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

@Injectable()
export class ProductionOrderService extends ProductionOrderServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rabbitProducer: RabbitMQProducerService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly orderValidationService: OrderValidationService,
    private readonly containerItemService: ContainerItemService,
    @Inject(forwardRef(() => ScheduleOrderGroupingService))
    private readonly scheduleOrderGroupingService: ScheduleOrderGroupingService,
    @Inject(forwardRef(() => ScheduleOrderService))
    private readonly scheduleOrderService: ScheduleOrderService,
    private readonly mqttDomainPublisher: MqttDomainPublisherService
  ) {
    super(prisma);
  }

  async createProductionOrder<T extends Prisma.ProductionOrderCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductionOrderCreateArgs>
  ): Promise<import(".prisma/client").ProductionOrder> {
    // Validate production order data before creation
    await this.validateProductionOrderData(args.data);

    const productionOrder = await super.createProductionOrder({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
        scheduleOrder: true,
        item: true,
        recipe: true,
        bom: true,
        containerItem: true,
      },
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Productionorder,
      {
        recordName: "ProductionOrder",
        event_type: "create",
        data: productionOrder,
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ProductionOrder",
      eventType: "create",
      data: productionOrder as any,
    });
    this.logger.log(
      `Created ProductionOrder: ${productionOrder.id} & pushed to topic`
    );
    return productionOrder;
  }

  /**
   * @deprecated This method is deprecated in favor of the new Many:1 PrO->SchO workflow.
   * Use ScheduleOrderGroupingService.createScheduleOrderFromProductionOrders() instead.
   * This method will be removed in a future version.
   */
  async createProductionOrderWithSchedule(
    data: CreateProductionOrderWithScheduleDto
  ): Promise<{
    productionOrder: import(".prisma/client").ProductionOrder;
    scheduleOrder: import(".prisma/client").ScheduleOrder;
    scheduleOrderQueue: import(".prisma/client").ScheduleOrderQueue;
  }> {
    throw new BadRequestException(
      "This workflow is deprecated. Use the new Many:1 Production Order to Schedule Order workflow via ScheduleOrderGroupingService instead."
    );
    // This method is deprecated - throwing error instead of executing
  }

  /**
   * Creates a new BOM from an existing recipe BOM
   */
  private async createBomFromRecipeBom(
    recipeId: string,
    recipeName: string,
    customerName: string
  ): Promise<string> {
    // Find recipe BOM associated with this recipe
    const recipeBoms = await this.prisma.recipeBom.findMany({
      where: {
        recipe: {
          some: { id: recipeId },
        },
      },
      include: {
        recipeBomITem: true,
      },
    });

    if (!recipeBoms || recipeBoms.length === 0) {
      throw new Error(`No recipe BOM found for recipe ID ${recipeId}`);
    }

    // Use the first recipe BOM (prefer master if available)
    const recipeBom = recipeBoms.find((bom) => bom.master) || recipeBoms[0];

    // We need to get an item ID for the BOM - use the one from data.itemId
    const item = await this.prisma.item.findFirst({
      where: {
        productionOrders: {
          some: {
            recipeId,
          },
        },
      },
    });

    if (!item) {
      throw new Error(
        `Could not find a suitable item for the BOM associated with recipe ID ${recipeId}`
      );
    }

    // Create a new BOM
    const bom = await this.prisma.bom.create({
      data: {
        bomName: `${recipeName}-${customerName}-${new Date()
          .toISOString()
          .slice(0, 10)}`,
        bomRevision: "1.0",
        bomType: "ProductionBom",
        createdBy: "system",
        item: {
          connect: { id: item.id },
        },
      },
    });

    if (!bom) {
      throw new Error("Failed to create BOM");
    }

    // Create BOM items from recipe BOM items
    for (const recipeBomItem of recipeBom.recipeBomITem) {
      if (!recipeBomItem.itemId) {
        this.logger.warn(
          `Recipe BOM item ${recipeBomItem.id} has no item ID, skipping`
        );
        continue;
      }

      await this.prisma.bomItem.create({
        data: {
          bom: { connect: { id: bom.id } },
          item: { connect: { id: recipeBomItem.itemId } },
          quantity: recipeBomItem.quantity || 0,
          createdBy: "system",
        },
      });
    }

    return bom.id;
  }

  /**
   * @deprecated This method is deprecated in favor of ScheduleOrderGroupingService
   * Schedule Order creation is now handled by the grouping service for Many:1 workflow
   */
  private async createScheduleOrder(): Promise<never> {
    throw new BadRequestException(
      "Schedule Order creation is now handled by ScheduleOrderGroupingService"
    );
  }

  /**
   * @deprecated This method is deprecated in favor of ScheduleOrderService queue management
   * Schedule Order queue management is now handled by the ScheduleOrderService
   */
  private async createScheduleOrderQueue(): Promise<never> {
    throw new BadRequestException(
      "Schedule Order queue creation is now handled by ScheduleOrderService"
    );
  }

  private async createProductionOrderInternal(
    recipeId: string,
    itemId: string,
    bomId: string,
    customerId: string,
    customerCode: string,
    orderQty: number,
    username: string,
    containerType?: EnumProductionOrderContainerType,
    containerItems?: string[]
  ): Promise<import(".prisma/client").ProductionOrder> {
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    // Get recipe name using the recipeId
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
    });

    if (!recipe) {
      throw new Error(`Recipe with ID ${recipeId} not found`);
    }

    const productionOrderData: any = {
      name: `PO-${customerCode}-${recipe.Recipe}-${timestamp}`,
      recipe: { connect: { id: recipeId } },
      customer: { connect: { id: customerId } },
      item: { connect: { id: itemId } },
      bom: { connect: { id: bomId } },
      status: EnumProductionOrderStatus.Initiated,
      customerCode: customerCode,
      units: "Barrels",
      quantity: orderQty,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      // Production execution fields removed - now managed by ScheduleOrder
      createdBy: username,
    };

    // Add container type if provided
    if (containerType) {
      productionOrderData.containerType = containerType;
    }

    // Connect container items if provided
    if (containerItems && containerItems.length > 0) {
      productionOrderData.containerItem = {
        connect: containerItems.map((id) => ({ id })),
      };
    }

    // Schedule Order connection removed - now handled by ScheduleOrderGroupingService

    const productionOrder = await this.prisma.productionOrder.create({
      data: productionOrderData,
    });

    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Productionorder,
      {
        recordName: "ProductionOrder",
        event_type: "create",
        data: productionOrder,
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ProductionOrder",
      eventType: "create",
      data: productionOrder as any,
    });
    return productionOrder;
  }

  async updateProductionOrder<T extends Prisma.ProductionOrderUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductionOrderUpdateArgs>
  ): Promise<import(".prisma/client").ProductionOrder> {
    // Guard: validate cancellation transitions
    const newStatus = (args.data as any)?.status;
    if (newStatus === EnumProductionOrderStatus.Cancelled) {
      const existing = await this.prisma.productionOrder.findUnique({
        where: args.where as any,
        select: { id: true, status: true, scheduleOrderId: true },
      });
      if (!existing) {
        throw new BadRequestException("Production order not found");
      }
      if (
        existing.status !== EnumProductionOrderStatus.Planned &&
        existing.status !== EnumProductionOrderStatus.Initiated
      ) {
        throw new BadRequestException(
          `Cannot cancel a production order with status "${existing.status}". Only Planned or Initiated orders can be cancelled.`
        );
      }
      if (existing.scheduleOrderId) {
        throw new BadRequestException(
          "Cannot cancel a production order that is linked to a schedule order. Remove it from the schedule first."
        );
      }
    }

    const productionOrder = await super.updateProductionOrder({
      data: {
        ...args.data,
      },
      include: {
        ...args.include,
        scheduleOrder: true,
        item: true,
        recipe: true,
        bom: true,
      },
      where: args.where,
    });
    await this.rabbitProducer.emitMessage(
      WhMessageBrokerTopics.WhWhk01Distillery01Productionorder,
      {
        recordName: "ProductionOrder",
        event_type: "update",
        data: productionOrder,
      }
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ProductionOrder",
      eventType: "update",
      data: productionOrder as any,
    });
    this.logger.log(
      `Updated ProductionOrder: ${productionOrder.id} & pushed to topic`
    );
    return productionOrder;
  }

  async deleteProductionOrder<T extends Prisma.ProductionOrderDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductionOrderDeleteArgs>
  ): Promise<import(".prisma/client").ProductionOrder> {
    throw new Error("Delete operations are not allowed for ProductionOrder.");
  }

  /**
   * Creates a production order from the frontend wizard with complex payload (Complete version)
   * All write operations are wrapped in a single transaction for atomicity.
   */
  async createProductionOrderFromWizardComplete(
    data: CreateProductionOrderWizardDto
  ): Promise<{
    productionOrder: import(".prisma/client").ProductionOrder;
    item: import(".prisma/client").Item;
    bom: import(".prisma/client").Bom;
    scheduleOrder?: import(".prisma/client").ScheduleOrder;
  }> {
    this.logger.log(
      `Creating production order from wizard for recipe: ${data.recipe.id}`
    );

    // ============================================
    // PHASE 1: Read-only validation (outside transaction)
    // ============================================

    // 1. Validate recipe exists
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: data.recipe.id },
      include: {
        recipeGroup: true,
      },
    });

    if (!recipe) {
      throw new Error(`Recipe with ID ${data.recipe.id} not found`);
    }

    // 2. Find customer by customer code
    const customer = await this.prisma.customer.findFirst({
      where: { customerCode: data.productionOrder.customerCode },
    });

    if (!customer) {
      throw new Error(
        `Customer with code ${data.productionOrder.customerCode} not found`
      );
    }

    // 3. Generate item number using the specified format
    const itemNumber = await this.generateItemNumber(
      data.productionOrder.customerCode,
      recipe,
      data.productionOrder.finalProof,
      data.productionOrder.containerType
    );

    // 6. Prepare bin configurations metadata (no DB write needed)
    const binConfigMetadata = {
      sil110ConfigId: data.binConfigurations.sil110ConfigId,
      sil115ConfigId: data.binConfigurations.sil115ConfigId,
      sil120ConfigId: data.binConfigurations.sil120ConfigId,
      totalCooks: data.binConfigurations.totalCooks,
      totalFermenters: data.binConfigurations.totalFermenters,
      cooksPerFermenter: data.binConfigurations.cooksPerFermenter,
    };

    // ============================================
    // PHASE 2: All writes in single atomic transaction
    // ============================================
    this.logger.log(
      `Starting atomic transaction for production order creation`
    );

    const { productionOrder, item, bom, recipeGroupId } =
      await this.prisma.$transaction(
        async (tx) => {
          // 4. Create or find the item
          this.logger.log(
            `🔍 About to create/find item with units: '${
              data.productionOrder.units
            }' (type: ${typeof data.productionOrder.units})`
          );
          const { item, validatedUnitsId } = await this.createOrFindItem(
            tx,
            itemNumber,
            data.productionOrder.orderName,
            data.productionOrder.units,
            data.recipe.whiskeyType,
            data.productionOrder.containerType
          );

          // 5. Create BOM from wizard BOM items
          const bom = await this.createBomFromWizardItems(
            tx,
            data.bomItems,
            `${data.productionOrder.orderName}-BOM`,
            item.id,
            data.metadata.createdBy
          );

          // 7. Get or create recipe group ID
          let recipeGroupId = recipe.recipeGroup?.id;
          if (!recipeGroupId) {
            const recipeGroups = await tx.recipeGroup.findMany({
              where: {
                recipes: {
                  some: {
                    id: data.recipe.id,
                  },
                },
              },
            });

            if (recipeGroups && recipeGroups.length > 0) {
              recipeGroupId = recipeGroups[0].id;
            } else {
              // Auto-create recipe group for recipes without one
              try {
                const mashBill = MashBillParser.extractMashBillString(
                  recipe.Recipe
                );

                // Find or create recipe group by mash bill
                let recipeGroup = await tx.recipeGroup.findFirst({
                  where: { recipe: mashBill },
                });

                if (!recipeGroup) {
                  recipeGroup = await tx.recipeGroup.create({
                    data: {
                      recipe: mashBill,
                      revision: 1,
                      createdBy: "system",
                    },
                  });
                  this.logger.log(
                    `Auto-created recipe group for mash bill: ${mashBill}`
                  );
                }

                // Link recipe to the group
                await tx.recipe.update({
                  where: { id: recipe.id },
                  data: { recipeGroup: { connect: { id: recipeGroup.id } } },
                });

                recipeGroupId = recipeGroup.id;
                this.logger.log(
                  `Linked recipe ${recipe.id} to recipe group ${recipeGroup.id}`
                );
              } catch (err) {
                throw new Error(
                  `Cannot extract mash bill from recipe name "${recipe.Recipe}" to create recipe group`
                );
              }
            }
          }

          // 8. Create production order
          const productionOrder =
            await this.createProductionOrderFromWizardData(
              tx,
              data,
              recipe.id,
              item.id,
              bom.id,
              customer.id,
              binConfigMetadata,
              validatedUnitsId
            );

          this.logger.log(
            `Created ProductionOrder ${productionOrder.id} in transaction`
          );

          return { productionOrder, item, bom, recipeGroupId };
        },
        {
          // Increase timeout for complex production order creation with remote DB
          timeout: 30000, // 30 seconds
        }
      );

    this.logger.log(
      `Transaction committed successfully for ProductionOrder ${productionOrder.id}`
    );
    this.mqttDomainPublisher.publishDomainEvent({
      entityType: "ProductionOrder",
      eventType: "wizard_complete",
      data: productionOrder as any,
    });

    // ============================================
    // PHASE 3: Auto-schedule (separate transaction - already atomic in its own service)
    // ============================================
    let scheduleOrder: import(".prisma/client").ScheduleOrder | undefined;

    if (data.autoSchedule) {
      this.logger.log(
        `Auto-scheduling enabled for Production Order ${productionOrder.id}`
      );

      try {
        // Create Schedule Order from Production Order (has its own transaction)
        scheduleOrder =
          await this.scheduleOrderGroupingService.createScheduleOrderFromProductionOrders(
            {
              productionOrderIds: [productionOrder.id],
              recipeGroupId: recipeGroupId!,
              // Pass dates and execution estimates for timeline calculation
              estimatedStart: new Date(data.productionOrder.startDate),
              estimatedEnd: new Date(data.productionOrder.endDate),
              totalCooks: data.binConfigurations.totalCooks,
              totalFermenters: data.binConfigurations.totalFermenters,
              // Production estimation fields
              estimatedBarrelsPerFermenter:
                data.binConfigurations.barrelsPerFermenter,
              estimatedPGsPerBbl: data.binConfigurations.proofGallonsPerBarrel,
              totalBarrels: data.scheduleOrder?.totalBarrels,
              totalProofGallons: data.scheduleOrder?.totalProofGallons,
              totalGrainWeight: data.productionOrder.totalGrainLoad,
            }
          );

        if (scheduleOrder) {
          this.logger.log(
            `Production Order ${productionOrder.id} auto-scheduled to Schedule Order ${scheduleOrder.id}`
          );

          // Add to Schedule Order Queue
          await this.scheduleOrderService.createScheduleOrderQueue(
            scheduleOrder.id
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to auto-schedule Production Order ${productionOrder.id}`,
          error
        );
        // We don't throw here - ProductionOrder was created successfully
        // The user can manually schedule it later
      }
    }

    this.logger.log(
      `Production order created successfully from wizard: ${productionOrder.id}`
    );

    return {
      productionOrder,
      item,
      bom,
      scheduleOrder,
    };
  }

  /**
   * Generates item number using format: CUS-%%-%%-%%-%%-53-04-4-4-0-120-v01
   */
  private async generateItemNumber(
    customerCode: string,
    recipe: any,
    finalProof: number,
    containerType: EnumProductionOrderContainerType
  ): Promise<string> {
    // Get mash bill from recipe (placeholder logic - adjust based on actual recipe structure)
    const mashBill = await this.getMashBillFromRecipe(recipe.id);

    // Barrel record info (only for barrel container type)
    const barrelInfo =
      containerType === EnumProductionOrderContainerType.LargeBarrel
        ? "53-04-4-4-0"
        : "00-00-0-0-0";

    // Item revision (start with v01)
    const revision = "v01";

    return `${customerCode}-${mashBill}-${barrelInfo}-${finalProof}-${revision}`;
  }

  /**
   * Gets mash bill information from recipe name
   * Extracts pattern like "75-21-00-04" from recipe names like "DWL-75-21-00-04-v01"
   */
  private async getMashBillFromRecipe(recipeId: string): Promise<string> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { Recipe: true },
    });

    if (!recipe) {
      throw new Error(`Recipe with ID ${recipeId} not found`);
    }

    const recipeName = recipe.Recipe;
    this.logger.log(
      `🔍 Extracting mash bill from recipe name: '${recipeName}'`
    );

    // Pattern to match mash bill: 4 groups of 2 digits separated by hyphens
    // Example: "DWL-75-21-00-04-v01" should extract "75-21-00-04"
    const mashBillPattern = /(\d{2}-\d{2}-\d{2}-\d{2})/;
    const match = recipeName.match(mashBillPattern);

    if (match && match[1]) {
      this.logger.log(
        `✅ Extracted mash bill: '${match[1]}' from recipe name: '${recipeName}'`
      );
      return match[1];
    }

    // If no pattern found, try to extract any sequence of 2-digit groups
    const fallbackPattern = /(\d{2})-(\d{2})-(\d{2})-(\d{2})/;
    const fallbackMatch = recipeName.match(fallbackPattern);

    if (fallbackMatch) {
      const mashBill = `${fallbackMatch[1]}-${fallbackMatch[2]}-${fallbackMatch[3]}-${fallbackMatch[4]}`;
      this.logger.log(
        `✅ Extracted mash bill using fallback pattern: '${mashBill}' from recipe name: '${recipeName}'`
      );
      return mashBill;
    }

    // Default mash bill if no pattern found
    this.logger.warn(
      `⚠️ Could not extract mash bill from recipe name: '${recipeName}', using default`
    );
    return "70-20-08-02";
  }

  /**
   * Creates or finds an item with the generated item number
   */
  private async createOrFindItem(
    tx: PrismaTransactionClient,
    itemNumber: string,
    itemName: string,
    unitsId: string,
    whiskeyType: string,
    containerType?: EnumProductionOrderContainerType
  ): Promise<{
    item: import(".prisma/client").Item;
    validatedUnitsId: string;
  }> {
    this.logger.log(
      `🔍 createOrFindItem called with unitsId: '${unitsId}' for item: '${itemNumber}'`
    );

    // Check if item already exists
    const existingItem = await tx.item.findFirst({
      where: { itemNumber: itemNumber },
    });

    if (existingItem) {
      // Return existing item with its current unitsId
      if (!existingItem.unitsId) {
        throw new Error(
          `Existing item '${itemNumber}' has no unitsId. Please update the item with a valid units ID.`
        );
      }

      this.logger.log(
        `✅ Found existing item '${itemNumber}' with unitsId: '${existingItem.unitsId}'`
      );
      return {
        item: existingItem,
        validatedUnitsId: existingItem.unitsId,
      };
    }

    // Validate that the unitsId exists - throw error if not found
    if (!unitsId) {
      throw new Error(
        `No unitsId provided for creating item '${itemNumber}'. A valid units ID is required.`
      );
    }

    this.logger.log(`🔍 Validating unitsId: '${unitsId}'`);
    const units = await tx.units.findUnique({
      where: { id: unitsId },
    });

    if (!units) {
      // Get list of available units for better error message
      const availableUnits = await tx.units.findMany({
        where: { active: true },
        select: { id: true, name: true },
        take: 10,
      });

      const unitsList = availableUnits
        .map((u) => `${u.name} (${u.id})`)
        .join(", ");

      throw new Error(
        `Invalid unitsId '${unitsId}' provided for item '${itemNumber}'. ` +
          `Unit not found in database. Available units: ${unitsList}${
            availableUnits.length === 10 ? "..." : ""
          }`
      );
    }

    this.logger.log(
      `✅ Units validation passed. Creating item '${itemNumber}' with unitsId: '${unitsId}'`
    );

    // Determine itemClass and itemGroup based on container type
    const itemClass = "Assembly";
    let itemGroup: string;

    if (
      containerType === EnumProductionOrderContainerType.LargeBarrel ||
      containerType === EnumProductionOrderContainerType.SmallBarrel
    ) {
      itemGroup = "FG-BBL";
    } else {
      itemGroup = "FG-DIS";
    }

    this.logger.log(
      `📝 Item classification: class='${itemClass}', group='${itemGroup}' (containerType: ${containerType})`
    );

    // Create new item with validated unitsId and all required fields
    const item = await tx.item.create({
      data: {
        itemNumber: itemNumber,
        itemName: itemNumber, // Set itemName to same value as itemNumber
        itemDescription: itemNumber, // Set itemDescription to same value as itemNumber
        itemType: whiskeyType,
        itemClass: itemClass,
        itemGroup: itemGroup,
        erpId: `ERP-${itemNumber}`,
        unitsId: unitsId,
        createdBy: "wizard-system",
      },
    });

    this.logger.log(
      `✅ Successfully created item '${itemNumber}' with ID: '${item.id}'`
    );
    return { item, validatedUnitsId: unitsId };
  }

  /**
   * Creates BOM from wizard BOM items
   */
  private async createBomFromWizardItems(
    tx: PrismaTransactionClient,
    bomItems: any[],
    bomName: string,
    itemId: string,
    createdBy: string
  ): Promise<import(".prisma/client").Bom> {
    // Create the BOM
    const bom = await tx.bom.create({
      data: {
        bomName: bomName,
        bomRevision: `${bomName}-R1-${Date.now().toString(36)}`,
        item: { connect: { id: itemId } },
        createdBy: createdBy,
      },
    });

    // Create BOM items
    for (const bomItem of bomItems) {
      // Find or create the item for this BOM item
      const item = await this.findOrCreateBomItem(tx, bomItem);

      await tx.bomItem.create({
        data: {
          bom: { connect: { id: bom.id } },
          item: { connect: { id: item.id } },
          quantity: bomItem.quantity,
          units: bomItem.unit,
          createdBy: createdBy,
        },
      });
    }

    return bom;
  }

  /**
   * Finds or creates an item for BOM item
   */
  private async findOrCreateBomItem(
    tx: PrismaTransactionClient,
    bomItemData: any
  ): Promise<import(".prisma/client").Item> {
    // Try to find existing item by item code
    const existingItem = await tx.item.findFirst({
      where: {
        OR: [
          { itemNumber: bomItemData.itemCode },
          { itemName: bomItemData.name },
        ],
      },
    });

    if (existingItem) {
      return existingItem;
    }

    // Find units by name
    const units = await tx.units.findFirst({
      where: { name: bomItemData.unit },
    });

    if (!units) {
      throw new Error(`Unit '${bomItemData.unit}' not found`);
    }

    // Create new item
    return tx.item.create({
      data: {
        itemNumber: bomItemData.itemCode,
        itemName: bomItemData.name,
        itemType: bomItemData.category,
        erpId: `null`,
        units: { connect: { id: units.id } },
        createdBy: "wizard-system",
      },
    });
  }

  /**
   * Creates production order from wizard data
   */
  private async createProductionOrderFromWizardData(
    tx: PrismaTransactionClient,
    data: CreateProductionOrderWizardDto,
    recipeId: string,
    itemId: string,
    bomId: string,
    customerId: string,
    // scheduleOrderId: string,
    binConfigMetadata: any,
    validatedUnitsId: string
  ): Promise<import(".prisma/client").ProductionOrder> {
    const startDate = new Date(data.productionOrder.startDate);
    const endDate = new Date(data.productionOrder.endDate);

    return tx.productionOrder.create({
      data: {
        name: `${data.productionOrder.orderName}-${Date.now().toString(36)}`,
        recipe: { connect: { id: recipeId } },
        customer: { connect: { id: customerId } },
        item: { connect: { id: itemId } },
        bom: { connect: { id: bomId } },
        status: EnumProductionOrderStatus.Initiated,
        customerCode: data.productionOrder.customerCode,
        units: { connect: { id: validatedUnitsId } },
        quantity: data.productionOrder.quantity,
        startDate: startDate,
        endDate: endDate,
        containerType: data.productionOrder.containerType,
        // Production execution fields removed - now managed by ScheduleOrder
        upperControlLimit: data.productionOrder.upperControlLimit,
        lowerControlLimit: data.productionOrder.lowerControlLimit,
        createdBy: data.metadata.createdBy,
      },
    });
  }

  /**
   * Creates a production order from wizard data (GraphQL version)
   */
  async createProductionOrderFromWizard(
    data: CreateProductionOrderWizardInput
  ): Promise<import(".prisma/client").ProductionOrder> {
    // Convert GraphQL input to DTO format
    const dtoData: CreateProductionOrderWizardDto = {
      productionOrder: {
        ...data.productionOrder,
        fermenters: data.productionOrder.fermenters || 0,
        cooks: data.productionOrder.cooks || 0,
        totalGrainLoad: data.productionOrder.totalGrainLoad || 0,
        estBblsPerFerm: data.productionOrder.estBblsPerFerm || 0,
        estPGsPerBshl: data.productionOrder.estPGsPerBshl || 0,
        estPGsPerBbl: data.productionOrder.estPGsPerBbl || 0,
        upperControlLimit: data.productionOrder.upperControlLimit || 0,
        lowerControlLimit: data.productionOrder.lowerControlLimit || 0,
      },
      recipe: {
        ...data.recipe,
        whiskeyType: data.recipe.whiskeyType || "Unknown",
      },
      bomItems: data.bomItems.map((item) => ({
        ...item,
        category: item.category || "Unknown",
        itemGroup: item.itemGroup || "Unknown",
      })),
      binConfigurations: data.binConfigurations
        ? {
            sil110ConfigId: data.binConfigurations.sil110ConfigId || "",
            sil115ConfigId: data.binConfigurations.sil115ConfigId || "",
            sil120ConfigId: data.binConfigurations.sil120ConfigId || "",
            totalCooks: data.binConfigurations.totalCooks || 0,
            totalFermenters: data.binConfigurations.totalFermenters || 0,
            cooksPerFermenter: data.binConfigurations.cooksPerFermenter || 0,
            entryProof: data.binConfigurations.entryProof || 0,
            proofGallonsPerBarrel:
              data.binConfigurations.proofGallonsPerBarrel || 0,
            barrelsPerFermenter:
              data.binConfigurations.barrelsPerFermenter || 0,
          }
        : {
            sil110ConfigId: "",
            sil115ConfigId: "",
            sil120ConfigId: "",
            totalCooks: 0,
            totalFermenters: 0,
            cooksPerFermenter: 0,
            entryProof: 0,
            proofGallonsPerBarrel: 0,
            barrelsPerFermenter: 0,
          },
      scheduleOrder: data.scheduleOrder
        ? {
            estimatedStart: data.scheduleOrder.estimatedStart,
            estimatedEnd: data.scheduleOrder.estimatedEnd,
            totalBarrels: data.scheduleOrder.totalBarrels || 0,
            totalProofGallons: data.scheduleOrder.totalProofGallons || 0,
            duration: data.scheduleOrder.duration || 0,
            durationUnits: data.scheduleOrder.durationUnits || "hours",
          }
        : {
            estimatedStart: new Date().toISOString(),
            estimatedEnd: new Date().toISOString(),
            totalBarrels: 0,
            totalProofGallons: 0,
            duration: 0,
            durationUnits: "hours",
          },
      autoSchedule: data.autoSchedule,
      metadata: {
        ...data.metadata,
        source: data.metadata.source || "graphql-wizard",
        version: data.metadata.version || "1.0",
      },
    };

    return this.createProductionOrderFromWizardDto(dtoData);
  }

  /**
   * Creates a production order from wizard data (DTO version)
   */
  async createProductionOrderFromWizardDto(
    data: CreateProductionOrderWizardDto
  ): Promise<import(".prisma/client").ProductionOrder> {
    const result = await this.createProductionOrderFromWizardComplete(data);
    return result.productionOrder;
  }

  /**
   * Validates production order data before creation using the OrderValidationService
   * Enforces MES Phase 1 "one-of" constraints for Production Orders
   */
  private async validateProductionOrderData(
    data:
      | Prisma.ProductionOrderCreateInput
      | Prisma.ProductionOrderUncheckedCreateInput
  ): Promise<void> {
    // MES Phase 1 Constraint Validation: Each Production Order must have exactly ONE of each

    // 1. Validate ONE Container Type (required)
    if (!data.containerType) {
      throw new BadRequestException(
        "Container type is required for MES Phase 1 compliance. Each Production Order must specify exactly one container type."
      );
    }

    // 2. Validate ONE Final Proof (required and valid)
    if (!data.finalProof || data.finalProof <= 0) {
      throw new BadRequestException(
        "Final proof is required and must be greater than 0 for MES Phase 1 compliance. Each Production Order must specify exactly one proof level."
      );
    }

    // Type guard to check if this is ProductionOrderCreateInput (with nested objects)
    const isCreateInput = (d: any): d is Prisma.ProductionOrderCreateInput => {
      return (
        d.customer &&
        typeof d.customer === "object" &&
        (d.customer.connect || d.customer.create)
      );
    };

    let customerId: string | undefined;
    let bomId: string | undefined;
    let itemId: string | undefined;
    let recipeId: string | undefined;
    let containerItems: any[] = [];

    if (isCreateInput(data)) {
      // Handle ProductionOrderCreateInput with nested connect/create objects
      const isCreatingNewObjects =
        data.customer?.create || data.bom?.create || data.item?.create;
      if (isCreatingNewObjects) {
        this.logger.log(
          "Skipping validation for creation with new related objects"
        );
        return;
      }

      // 3. Validate ONE Customer (required)
      customerId = data.customer?.connect?.id;
      if (!customerId) {
        throw new BadRequestException(
          "Customer is required for MES Phase 1 compliance. Each Production Order must be specific to exactly one customer."
        );
      }

      // 4. Validate ONE BOM (required - must be production BOM, not recipe BOM)
      bomId = data.bom?.connect?.id;
      if (!bomId) {
        throw new BadRequestException(
          "BOM is required for MES Phase 1 compliance. Each Production Order must specify exactly one production BOM."
        );
      }

      // 5. Validate ONE Final Item FG Code (required)
      itemId = data.item?.connect?.id;
      if (!itemId) {
        throw new BadRequestException(
          "Item is required for MES Phase 1 compliance. Each Production Order must specify exactly one final FG item code."
        );
      }

      // 6. Validate ONE Recipe (for mash bill constraint)
      recipeId = data.recipe?.connect?.id;

      // 7. Validate Container Item Constraints
      const containerItemIds = data.containerItem?.connect
        ? Array.isArray(data.containerItem.connect)
          ? data.containerItem.connect
              .map((c) => c.id)
              .filter((id): id is string => !!id)
          : data.containerItem.connect.id
          ? [data.containerItem.connect.id]
          : []
        : [];

      // MES Phase 1 Constraint: Prevent multiple container items for single Production Order
      if (containerItemIds.length > 1) {
        throw new BadRequestException(
          `MES Phase 1 constraint violation: Production Order cannot have multiple container items (${containerItemIds.length} provided). Each Production Order must specify at most one specific container item.`
        );
      }

      if (containerItemIds.length > 0) {
        containerItems =
          (await this.prisma.item.findMany({
            where: { id: { in: containerItemIds } },
          })) || [];

        // Validate container item compatibility
        for (const containerItem of containerItems) {
          const compatibility =
            await this.containerItemService.validateContainerItemCompatibility(
              containerItem.id,
              data.containerType
            );

          if (!compatibility.isValid) {
            throw new BadRequestException(
              `Container item compatibility error: ${compatibility.message}`
            );
          }
        }
      }
    } else {
      // Handle ProductionOrderUncheckedCreateInput with direct ID references
      const uncheckedData = data as Prisma.ProductionOrderUncheckedCreateInput;

      customerId = uncheckedData.customerId;
      bomId = uncheckedData.bomId;
      itemId = uncheckedData.fgItemId;
      recipeId = uncheckedData.recipeId || undefined;

      // Validate required fields for unchecked input
      if (!customerId) {
        throw new BadRequestException(
          "Customer ID is required for MES Phase 1 compliance."
        );
      }
      if (!bomId) {
        throw new BadRequestException(
          "BOM ID is required for MES Phase 1 compliance."
        );
      }
      if (!itemId) {
        throw new BadRequestException(
          "Item ID is required for MES Phase 1 compliance."
        );
      }
    }

    // 8. Validate ONE Mash Bill through Recipe Group consistency
    if (recipeId) {
      await this.validateMashBillConsistency(
        recipeId,
        customerId,
        data.containerType
      );
    }

    // 9. Extract validation data and call comprehensive validation service
    const validationData: ProductionOrderValidationData = {
      customer: { id: customerId },
      bom: { id: bomId },
      item: { id: itemId },
      containerType: data.containerType,
      finalProof: data.finalProof,
      containerItem: containerItems,
      recipe: recipeId ? { id: recipeId } : undefined,
    };

    // Final validation through OrderValidationService
    await this.orderValidationService.validateProductionOrder(validationData);

    this.logger.log(
      `✅ MES Phase 1 Production Order validation passed: ONE customer (${customerId}), ONE BOM (${bomId}), ONE item (${itemId}), ONE container type (${data.containerType}), ONE proof (${data.finalProof})`
    );
  }

  /**
   * Validates mash bill consistency for MES Phase 1 requirements
   * Ensures recipe group alignment and prevents mash bill mixing within single Production Order
   */
  private async validateMashBillConsistency(
    recipeId: string,
    customerId: string,
    containerType: EnumProductionOrderContainerType
  ): Promise<void> {
    // Get recipe with recipe group information
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        recipeGroup: true,
      },
    });

    if (!recipe) {
      throw new BadRequestException(`Recipe with ID ${recipeId} not found`);
    }

    if (!recipe.recipeGroup) {
      throw new BadRequestException(
        `Recipe ${recipe.Recipe} must be associated with a recipe group for mash bill validation. MES Phase 1 requires explicit mash bill tracking.`
      );
    }

    // Log mash bill validation for traceability
    this.logger.log(
      `🔍 Validating mash bill consistency: Recipe "${recipe.Recipe}" belongs to recipe group "${recipe.recipeGroup.recipe}" (ID: ${recipe.recipeGroup.id})`
    );

    // Additional validation could include checking for conflicting mash bills within the same customer/container type
    // This ensures the "ONE mash bill" constraint is maintained at the Production Order level
  }
}
