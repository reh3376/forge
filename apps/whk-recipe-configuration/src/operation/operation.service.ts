import {BadRequestException, Injectable} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OperationServiceBase } from "./base/operation.service.base";
import {Operation, Prisma} from "@prisma/client";
import {PinoLogger} from "nestjs-pino";
import {RabbitMQProducerService} from "../rabbitmq/rabbitmq.producer.service";
import {MyMessageBrokerTopics} from "../rabbitmq/topics";

@Injectable()
export class OperationService extends OperationServiceBase {
  constructor(
      protected readonly prisma: PrismaService,
      protected readonly rabbitProducer: RabbitMQProducerService,
      private logger: PinoLogger,
  ) {
    super(prisma);
  }
  private unitProcedureOperationsMap: { [key: string]: string[] } = {
    Mashing01: ['Cook', 'Clean'],
    Fermentation01: ['FermenterSet', 'Fermenter', 'Clean'],
    Distillation01: ['StillRun', 'Clean'],
    Processing01: ['TankProcessing', 'Barreling'],
    Milling01: ['Mill'],
  };

  private operationEquipmentPhasesMap: { [key: string]: string[] } = {
    Cook: [
      'PreSteam',
      'Steam',
      'Hold',
      'BacksetAdd',
      'WaterAdd',
      'AdditiveAdd',
      'CornAdd',
      'MaltAdd',
      'RyeAdd',
      'WheatAdd',
      'Drop',
      'PhCapture',
      'Prompt',
      'Rinse',
      'Cooldown',
      'HotFlush',
      'CIP',
    ],
    FermenterSet: [
      'DropToMashCooler',
      'Fill',
    ],
    Fermenter: [
      'Run',
    ],
    Clean: [
      'FermenterSteam',
      'CoolerSteam',
      'DropTubSteam',
      'DropLineSteam'
    ],
    StillRun: ['StillStartup', 'StillRun', 'StillShutdown'],
    TankProcessing: ['Cut', 'Hold', 'Gauge'],
    Barreling: ['BarrelFill'],
    Mill: ['Mill'],
  };

  async createOperation<T extends Prisma.OperationCreateArgs>(
      args: Prisma.SelectSubset<T, Prisma.OperationCreateArgs>
  ): Promise<Operation> {
    const name = args.data.name as string;

    // if unit procedure id is provided, check if it matches the acceptable list for the operation
    if (args.data.unitProcedure?.connect?.id) {
      const unitProcedureId = args.data.unitProcedure?.connect?.id;
      const unitProcedure = await this.prisma.unitProcedure.findFirstOrThrow({where: {id: unitProcedureId as string}});
      this.logger.info(`UnitProcedure: ${unitProcedureId}`);

      // check unit procedure against the mapping. The unit procedure name is the key and this operation name should be in the array of acceptable operations
      const acceptableUnitProcedures = this.unitProcedureOperationsMap[unitProcedure.name];
      this.logger.info(`Acceptable Unit Procedures: ${acceptableUnitProcedures}`);

      if (!acceptableUnitProcedures) {
        throw new BadRequestException(`No Unit Procedure mapping found for Operation: ${name}`);
      }
      if (!acceptableUnitProcedures.every(unitProcedure => acceptableUnitProcedures.includes(args.data.name))) {
        throw new BadRequestException(`Provided UnitProcedure Id does not match the acceptable list for Operation: ${name}`);
      }
    }

    const equipmentPhases = Array.isArray(args.data.equipmentPhases) ? args.data.equipmentPhases.map((equipmentPhase: { name: any; }) => equipmentPhase.name) : [];

    const acceptableEquipmentPhases = this.operationEquipmentPhasesMap[name];
    if (!acceptableEquipmentPhases) {
      throw new BadRequestException(`No EquipmentPhases mapping found for unitProcedure: ${name}`);
    }

    if (!equipmentPhases.every(equipmentPhase => acceptableEquipmentPhases.includes(equipmentPhase))) {
      throw new BadRequestException(`Provided EquipmentPhases do not match acceptable list for unitProcedure: ${name}`);
    }

    // If EquipmentPhases are acceptable, proceed with the creation
    const operationData = await super.createOperation(args);

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Operation, {
      recordName: 'Operation',
      event_type: 'create',
      data: operationData
    });

    this.logger.info(`Updated Operation: ${operationData.name} & pushed to topic`);
    return operationData;


  }

  async updateOperation<T extends Prisma.OperationUpdateArgs>(
      args: Prisma.SelectSubset<T, Prisma.OperationUpdateArgs>
  ): Promise<Operation> {
    const operation = await this.prisma.operation.findFirstOrThrow({where: {id: args.where.id}}) as Operation;
    this.logger.info(`Updating Operation: ${operation.name}`);
    const name = operation.name as string;

    // if unit procedure id is provided, check if it matches the acceptable list for the operation
    if (args.data.unitProcedure?.connect?.id) {
      const unitProcedureId = args.data.unitProcedure?.connect?.id;
      const unitProcedure = await this.prisma.unitProcedure.findFirstOrThrow({where: {id: unitProcedureId as string}});
      this.logger.info(`UnitProcedure: ${unitProcedureId}`);

      // check unit procedure against the mapping. The unit procedure name is the key and this operation name should be in the array of acceptable operations
      const acceptableUnitProcedures = this.unitProcedureOperationsMap[unitProcedure.name];
      this.logger.info(`Acceptable Unit Procedures: ${acceptableUnitProcedures}`);

      if (!acceptableUnitProcedures) {
        throw new BadRequestException(`No Unit Procedure mapping found for Operation: ${name}`);
      }
      if (!acceptableUnitProcedures.every(unitProcedure => acceptableUnitProcedures.includes(operation.name))) {
        throw new BadRequestException(`Provided UnitProcedure Id does not match the acceptable list for Operation: ${name}`);
      }
    }

    const EquipmentPhases = Array.isArray(args.data.equipmentPhases) ? args.data.equipmentPhases.map((equipmentPhase: { name: any; }) => equipmentPhase.name) : [];
    this.logger.info(`Updating Operation: ${name}`);
    const acceptableEquipmentPhases = this.operationEquipmentPhasesMap[name];
    if (!acceptableEquipmentPhases) {
      throw new BadRequestException(`No EquipmentPhases mapping found for Operation: ${name}`);
    }

    if (!EquipmentPhases.every(equipmentPhase => acceptableEquipmentPhases.includes(equipmentPhase))) {
      throw new BadRequestException(`Provided EquipmentPhases do not match acceptable list for Operation: ${name}`);
    }

    const operationData = await super.updateOperation(args);

    await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Operation, {
        recordName: 'Operation',
        event_type: 'update',
        data: operationData
        });
    this.logger.info(`Updated Operation: ${operationData.name} & pushed to topic`);
    return operationData;
  }

    async deleteOperation<T extends Prisma.OperationDeleteArgs>(
        args: Prisma.SelectSubset<T, Prisma.OperationDeleteArgs>
    ): Promise<Operation> {
        const operation = await super.deleteOperation(args);
        await this.rabbitProducer.emitMessage(MyMessageBrokerTopics.WhWhk01Distillery01Operation, {
          recordName: 'Operation',
          event_type: 'delete',
          data: operation
        });
        this.logger.info(`Deleted Operation: ${operation.name} & pushed to topic`);
        return operation;
    }
}
