export interface EventContext {
  area?: string;
  assetId?: string;
  phase?: string;
  severity?: string;
  batchId?: string;
  scheduleOrderId?: string;
}

export interface DomainEventParams {
  entityType: string;
  eventType: string;
  data: Record<string, any>;
  context?: EventContext;
}
