import { EventContext } from "./types";

/**
 * Resolves {variable} placeholders in MQTT topic templates.
 *
 * Sources (in priority order):
 *  1. Explicit params: entityType, eventType
 *  2. EventContext: area, assetId, phase, severity, batchId, scheduleOrderId
 *  3. data object: any key referenced as {key}
 *
 * Unresolved variables are replaced with the key name (no braces in final topic).
 */
export function resolveTopicTemplate(
  template: string,
  entityType: string,
  eventType: string,
  data: Record<string, any>,
  context?: EventContext
): string {
  const vars: Record<string, string> = {
    entitytype: entityType.toLowerCase(),
    entityType: entityType.toLowerCase(),
    eventtype: eventType.toLowerCase(),
    eventType: eventType.toLowerCase(),
    area: context?.area || "distillery01",
    asset: context?.assetId || "unknown",
    assetId: context?.assetId || "unknown",
    phase: context?.phase?.toLowerCase() || "unknown",
    severity: context?.severity?.toLowerCase() || "unknown",
    batchId: context?.batchId || data.batchId || "unknown",
    scheduleOrderId:
      context?.scheduleOrderId || data.scheduleOrderId || data.id || "unknown",
    id: data.id || "unknown",
  };

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    // Check explicit vars first
    if (vars[key] !== undefined) {
      return vars[key];
    }
    // Check data object
    if (data[key] !== undefined && data[key] !== null) {
      return String(data[key]);
    }
    // Fallback: key name without braces
    return key;
  });
}
