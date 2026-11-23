import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { Request } from "express";
import { UserInfo } from "../../../auth/UserInfo";

interface AuthenticatedRequest extends Request {
  user?: UserInfo;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { method, url, body, user } = request;
    const timestamp = new Date().toISOString();
    const userInfo = user
      ? `${user.username} (${user.roles?.join(", ")})`
      : "anonymous";

    // Log the incoming request
    this.logger.log(
      `MQTT Publish Attempt - User: ${userInfo}, Method: ${method}, URL: ${url}, Timestamp: ${timestamp}`
    );

    // Log request details (mask sensitive data)
    const auditData = {
      timestamp,
      user: userInfo,
      method,
      url,
      brokerId: body?.brokerId,
      topic: body?.topic,
      payloadSize: body?.payload ? Buffer.byteLength(body.payload, "utf8") : 0,
      qos: body?.qos,
      retain: body?.retain,
    };

    this.logger.debug("MQTT Publish Request Details:", auditData);

    return next.handle().pipe(
      tap((response) => {
        // Log successful operation
        this.logger.log(
          `MQTT Publish Success - User: ${userInfo}, Topic: ${body?.topic}, Broker: ${body?.brokerId}`
        );

        this.logger.debug("MQTT Publish Success Details:", {
          ...auditData,
          success: true,
          responseTimestamp: new Date().toISOString(),
        });
      }),
      catchError((error) => {
        // Log failed operation
        this.logger.error(
          `MQTT Publish Failed - User: ${userInfo}, Topic: ${body?.topic}, Broker: ${body?.brokerId}, Error: ${error.message}`
        );

        this.logger.debug("MQTT Publish Failure Details:", {
          ...auditData,
          success: false,
          error: error.message,
          errorTimestamp: new Date().toISOString(),
        });

        throw error;
      })
    );
  }
}
