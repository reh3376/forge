import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { InjectRolesBuilder, RolesBuilder } from "nest-access-control";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { GqlExecutionContext } from "@nestjs/graphql";

@Injectable()
export class AclFilterResponseInterceptor implements NestInterceptor {
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

    // In development mode, bypass ACL filtering if no auth header is present
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    if (nodeEnv === "development") {
      // Check if this is a GraphQL context and if there's no auth header
      const contextType = context.getType().toString();
      if (contextType === "graphql") {
        const ctx = GqlExecutionContext.create(context);
        const request = ctx.getContext().req;
        const authHeader = request.headers?.authorization;

        // If no auth header in development, skip ACL filtering
        if (!authHeader) {
          return next.handle(); // Return data without filtering
        }
      } else if (contextType === "http") {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers?.authorization;

        // If no auth header in development, skip ACL filtering
        if (!authHeader) {
          return next.handle(); // Return data without filtering
        }
      }
    }

    // Normal ACL processing for production or when auth header is present
    const permission = this.rolesBuilder.permission({
      role: permissionsRoles.role,
      action: permissionsRoles.action,
      possession: permissionsRoles.possession,
      resource: permissionsRoles.resource,
    });

    return next.handle().pipe(
      map((data) => {
        if (Array.isArray(data)) {
          return data.map((results: any) => permission.filter(results));
        } else {
          return permission.filter(data);
        }
      })
    );
  }
}
