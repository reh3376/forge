/**
 * Audit event types for the enzyme dosing application
 */
export enum AuditEventType {
  // Authentication events
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Calculation events
  CALCULATION_PERFORMED = 'CALCULATION_PERFORMED',
  CALCULATION_FAILED = 'CALCULATION_FAILED',
  
  // Recipe BOM events
  BOM_SELECTED = 'BOM_SELECTED',
  BOM_AUTO_POPULATED = 'BOM_AUTO_POPULATED',
  
  // Data access events
  HISTORY_VIEWED = 'HISTORY_VIEWED',
  HISTORY_EXPORTED = 'HISTORY_EXPORTED',
  HISTORY_PRINTED = 'HISTORY_PRINTED',
  
  // Configuration events
  ENZYME_CONFIG_VIEWED = 'ENZYME_CONFIG_VIEWED',
  ENZYME_CONFIG_UPDATED = 'ENZYME_CONFIG_UPDATED',
  
  // Security events
  INVALID_INPUT_DETECTED = 'INVALID_INPUT_DETECTED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  
  // System events
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  API_CALL_FAILED = 'API_CALL_FAILED',
}

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  action: string;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Helper function to filter out undefined values
 */
function filterUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const filtered: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      filtered[key as keyof T] = value;
    }
  }
  return filtered;
}

/**
 * Audit logger for tracking critical actions
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private logs: AuditLogEntry[] = [];

  private constructor() {}

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Generate a unique ID for audit log entries
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current timestamp in ISO format
   */
  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Log an audit event
   */
  log(params: {
    eventType: AuditEventType;
    action: string;
    userId?: string;
    userEmail?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    resource?: string;
    details?: Record<string, unknown>;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }): void {
    const baseEntry = {
      id: this.generateId(),
      timestamp: this.getCurrentTimestamp(),
      eventType: params.eventType,
      action: params.action,
      details: params.details || {},
      success: params.success ?? true,
    };

    const filteredParams = filterUndefined({
      userId: params.userId,
      userEmail: params.userEmail,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      resource: params.resource,
      errorMessage: params.errorMessage,
      metadata: params.metadata,
    });

    const entry: AuditLogEntry = { ...baseEntry, ...filteredParams };

    this.logs.push(entry);

    // In production, this would be sent to a logging service
    this.persistLog(entry);
  }

  /**
   * Log authentication events
   */
  logAuth(params: {
    eventType: AuditEventType.LOGIN | AuditEventType.LOGOUT | AuditEventType.LOGIN_FAILED | AuditEventType.SESSION_EXPIRED;
    userId?: string;
    userEmail?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    success?: boolean;
    errorMessage?: string;
  }): void {
    const logParams = filterUndefined({
      eventType: params.eventType,
      action: `User ${params.eventType.toLowerCase()}`,
      resource: 'authentication',
      userId: params.userId,
      userEmail: params.userEmail,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: params.success,
      errorMessage: params.errorMessage,
    });

    this.log(logParams);
  }

  /**
   * Log enzyme calculation events
   */
  logCalculation(params: {
    userId?: string;
    userEmail?: string;
    sessionId?: string;
    mashBill?: string;
    grainLoad?: number;
    enzymeType?: string;
    calculationResult?: Record<string, unknown>;
    success?: boolean;
    errorMessage?: string;
  }): void {
    const logParams = filterUndefined({
      eventType: params.success !== false ? AuditEventType.CALCULATION_PERFORMED : AuditEventType.CALCULATION_FAILED,
      action: 'Enzyme dosing calculation',
      resource: 'enzyme_calculation',
      userId: params.userId,
      userEmail: params.userEmail,
      sessionId: params.sessionId,
      details: {
        mashBill: params.mashBill,
        grainLoad: params.grainLoad,
        enzymeType: params.enzymeType,
        result: params.calculationResult,
      },
      success: params.success ?? true,
      errorMessage: params.errorMessage,
    });

    this.log(logParams);
  }

  /**
   * Log BOM selection events
   */
  logBOMSelection(params: {
    userId?: string;
    userEmail?: string;
    sessionId?: string;
    bomId?: string;
    bomName?: string;
    autoPopulated?: boolean;
    populatedFields?: string[];
  }): void {
    const logParams = filterUndefined({
      eventType: params.autoPopulated ? AuditEventType.BOM_AUTO_POPULATED : AuditEventType.BOM_SELECTED,
      action: params.autoPopulated ? 'BOM auto-population' : 'BOM selection',
      resource: 'recipe_bom',
      userId: params.userId,
      userEmail: params.userEmail,
      sessionId: params.sessionId,
      details: {
        bomId: params.bomId,
        bomName: params.bomName,
        populatedFields: params.populatedFields,
      },
    });

    this.log(logParams);
  }

  /**
   * Log data access events
   */
  logDataAccess(params: {
    eventType: AuditEventType.HISTORY_VIEWED | AuditEventType.HISTORY_EXPORTED | AuditEventType.HISTORY_PRINTED;
    userId?: string;
    userEmail?: string;
    sessionId?: string;
    filters?: Record<string, unknown>;
    recordCount?: number;
    exportFormat?: string;
  }): void {
    const logParams = filterUndefined({
      eventType: params.eventType,
      action: `History ${params.eventType.toLowerCase().replace('history_', '')}`,
      resource: 'calculation_history',
      userId: params.userId,
      userEmail: params.userEmail,
      sessionId: params.sessionId,
      details: {
        filters: params.filters,
        recordCount: params.recordCount,
        exportFormat: params.exportFormat,
      },
    });

    this.log(logParams);
  }

  /**
   * Log security events
   */
  logSecurity(params: {
    eventType: AuditEventType.INVALID_INPUT_DETECTED | AuditEventType.RATE_LIMIT_EXCEEDED | AuditEventType.UNAUTHORIZED_ACCESS;
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    resource?: string;
    details?: Record<string, unknown>;
    errorMessage?: string;
  }): void {
    const logParams = filterUndefined({
      eventType: params.eventType,
      action: `Security event: ${params.eventType}`,
      userId: params.userId,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      resource: params.resource,
      details: params.details,
      success: false,
      errorMessage: params.errorMessage,
    });

    this.log(logParams);
  }

  /**
   * Log system errors
   */
  logError(params: {
    userId?: string;
    sessionId?: string;
    resource?: string;
    action: string;
    errorMessage: string;
    errorStack?: string;
    details?: Record<string, unknown>;
  }): void {
    const logParams = filterUndefined({
      eventType: AuditEventType.ERROR_OCCURRED,
      action: params.action,
      resource: params.resource,
      userId: params.userId,
      sessionId: params.sessionId,
      details: {
        ...params.details,
        errorStack: params.errorStack,
      },
      success: false,
      errorMessage: params.errorMessage,
    });

    this.log(logParams);
  }

  /**
   * Get audit logs with optional filtering
   */
  getLogs(filters?: {
    eventType?: AuditEventType;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
  }): AuditLogEntry[] {
    let filteredLogs = [...this.logs];

    if (filters) {
      if (filters.eventType) {
        filteredLogs = filteredLogs.filter(log => log.eventType === filters.eventType);
      }
      if (filters.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
      }
      if (filters.startDate) {
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= filters.startDate!);
      }
      if (filters.endDate) {
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= filters.endDate!);
      }
      if (filters.success !== undefined) {
        filteredLogs = filteredLogs.filter(log => log.success === filters.success);
      }
    }

    return filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Persist log entry (in production, this would send to a logging service)
   */
  private persistLog(entry: AuditLogEntry): void {
    // In development, log to console
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Audit Log:', {
        timestamp: entry.timestamp,
        event: entry.eventType,
        action: entry.action,
        user: entry.userEmail || entry.userId,
        success: entry.success,
        details: entry.details,
      });
    }

    // In production, this would be sent to:
    // - External logging service (e.g., Splunk, ELK stack)
    // - Database audit table
    // - SIEM system
    // - Compliance logging system
  }

  /**
   * Clear logs (for testing purposes only)
   */
  clearLogs(): void {
    if (process.env.NODE_ENV === 'test') {
      this.logs = [];
    }
  }
}

/**
 * Convenience function to get the audit logger instance
 */
export const auditLogger = AuditLogger.getInstance(); 