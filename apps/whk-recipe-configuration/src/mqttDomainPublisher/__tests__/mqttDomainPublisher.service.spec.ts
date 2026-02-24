import { Test, TestingModule } from "@nestjs/testing";
import { MqttDomainPublisherService } from "../mqttDomainPublisher.service";
import { PrismaService } from "../../prisma/prisma.service";
import { MqttService } from "../../providers/mqtt/mqtt.service";
import { EnumPayloadMode } from "@prisma/client";

const mockRule = (overrides: Record<string, any> = {}) => ({
  id: "rule-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "test",
  updatedBy: null,
  name: "Test Rule",
  description: null,
  entityType: "ScheduleOrder",
  eventType: "cook_complete",
  severityFilter: [],
  phaseFilter: [],
  assetFilter: [],
  topicTemplate: "whk/mes/{area}/{entityType}/{eventType}",
  payloadMode: EnumPayloadMode.Full,
  includeRelations: [],
  excludeFields: [],
  payloadTransform: null,
  qos: 1,
  retain: false,
  enabled: true,
  priority: 0,
  brokers: [{ id: "broker-1" }],
  ...overrides,
});

describe("MqttDomainPublisherService", () => {
  let service: MqttDomainPublisherService;
  let prisma: { mqttEventPublishRule: { findMany: jest.Mock } };
  let mqttService: { publish: jest.Mock; isBrokerConnected: jest.Mock };

  beforeEach(async () => {
    prisma = {
      mqttEventPublishRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mqttService = {
      publish: jest.fn().mockResolvedValue(undefined),
      isBrokerConnected: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttDomainPublisherService,
        { provide: PrismaService, useValue: prisma },
        { provide: MqttService, useValue: mqttService },
      ],
    }).compile();

    service = module.get(MqttDomainPublisherService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("does nothing when no rules match", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([]);
    await service.onModuleInit();

    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: { id: "so-1" },
    });

    expect(mqttService.publish).not.toHaveBeenCalled();
  });

  it("publishes to matched broker with resolved topic", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([mockRule()]);
    await service.onModuleInit();

    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: { id: "so-1", executedCooks: 3 },
      context: { area: "distillery01" },
    });

    expect(mqttService.publish).toHaveBeenCalledTimes(1);
    expect(mqttService.publish).toHaveBeenCalledWith(
      "broker-1",
      "whk/mes/distillery01/scheduleorder/cook_complete",
      expect.any(String),
      { qos: 1, retain: false }
    );

    const payload = JSON.parse(mqttService.publish.mock.calls[0][2]);
    expect(payload.entityType).toBe("ScheduleOrder");
    expect(payload.eventType).toBe("cook_complete");
    expect(payload.data.id).toBe("so-1");
  });

  it("wildcard rules match any eventType", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([
      mockRule({ eventType: "*" }),
    ]);
    await service.onModuleInit();

    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "any_event",
      data: { id: "so-1" },
    });

    expect(mqttService.publish).toHaveBeenCalledTimes(1);
  });

  it("EventOnly payload mode returns minimal data", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([
      mockRule({ payloadMode: EnumPayloadMode.EventOnly }),
    ]);
    await service.onModuleInit();

    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: { id: "so-1", sensitiveField: "should-not-appear" },
    });

    const payload = JSON.parse(mqttService.publish.mock.calls[0][2]);
    expect(payload.entityType).toBe("ScheduleOrder");
    expect(payload.entityId).toBe("so-1");
    expect(payload.data).toBeUndefined();
    expect(payload.sensitiveField).toBeUndefined();
  });

  it("excludeFields strips specified fields from payload", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([
      mockRule({ excludeFields: ["password", "internalNotes"] }),
    ]);
    await service.onModuleInit();

    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: {
        id: "so-1",
        password: "secret",
        internalNotes: "private",
        name: "keep",
      },
    });

    const payload = JSON.parse(mqttService.publish.mock.calls[0][2]);
    expect(payload.data.name).toBe("keep");
    expect(payload.data.password).toBeUndefined();
    expect(payload.data.internalNotes).toBeUndefined();
  });

  it("severity filter excludes non-matching events", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([
      mockRule({ severityFilter: ["Critical"] }),
    ]);
    await service.onModuleInit();

    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: { id: "so-1" },
      context: { severity: "Minor" },
    });

    expect(mqttService.publish).not.toHaveBeenCalled();
  });

  it("skips disconnected brokers", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([mockRule()]);
    await service.onModuleInit();
    mqttService.isBrokerConnected.mockReturnValue(false);

    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: { id: "so-1" },
    });

    expect(mqttService.publish).not.toHaveBeenCalled();
  });

  it("does not throw when publish fails", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([mockRule()]);
    await service.onModuleInit();
    mqttService.publish.mockRejectedValue(new Error("Connection lost"));

    await expect(
      service.publishDomainEvent({
        entityType: "ScheduleOrder",
        eventType: "cook_complete",
        data: { id: "so-1" },
      })
    ).resolves.not.toThrow();
  });

  it("refreshCache reloads rules from database", async () => {
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([]);
    await service.onModuleInit();

    // No rules initially
    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: { id: "so-1" },
    });
    expect(mqttService.publish).not.toHaveBeenCalled();

    // Add a rule and refresh
    prisma.mqttEventPublishRule.findMany.mockResolvedValue([mockRule()]);
    await service.refreshCache();

    await service.publishDomainEvent({
      entityType: "ScheduleOrder",
      eventType: "cook_complete",
      data: { id: "so-1" },
    });
    expect(mqttService.publish).toHaveBeenCalledTimes(1);
  });
});
