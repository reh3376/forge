import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { InjectRolesBuilder, RolesBuilder } from "nest-access-control";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { GqlExecutionContext } from "@nestjs/graphql";
import * as abacUtil from "../auth/abac.util";
import { ForbiddenException } from "../errors";

@Injectable()
export class AclValidateRequestInterceptor implements NestInterceptor {
  constructor(
    @InjectRolesBuilder() private readonly rolesBuilder: RolesBuilder,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const [permissionsRoles]: any = this.reflector.getAllAndMerge<string[]>(
      "roles",
      [context.getHandler(), context.getClass()]
    );

    // In development mode, bypass ACL validation if no auth header is present
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    if (nodeEnv === "development") {
      // Check if this is a GraphQL context and if there's no auth header
      const contextType = context.getType().toString();
      if (contextType === "graphql") {
        const ctx = GqlExecutionContext.create(context);
        const request = ctx.getContext().req;
        const authHeader = request.headers?.authorization;

        // If no auth header in development, skip ACL validation
        if (!authHeader) {
          return next.handle(); // Continue without validation
        }
      } else if (contextType === "http") {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers?.authorization;

        // If no auth header in development, skip ACL validation
        if (!authHeader) {
          return next.handle(); // Continue without validation
        }
      }
    }

    const type = context.getType();

    const inputDataToValidate =
      type === "http"
        ? context.switchToHttp().getRequest().body
        : context.getArgByIndex(1).data;

    const permission = this.rolesBuilder.permission({
      role: permissionsRoles.role,
      action: permissionsRoles.action,
      possession: permissionsRoles.possession,
      resource: permissionsRoles.resource,
    });

    const invalidAttributes = abacUtil.getInvalidAttributes(
      permission,
      inputDataToValidate
    );

    if (invalidAttributes.length) {
      throw new ForbiddenException(
        "Insufficient privileges to complete the operation"
      );
    }

    return next.handle();
  }
}
