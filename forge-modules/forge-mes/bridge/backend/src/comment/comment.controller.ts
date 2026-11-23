import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { CommentService } from "./comment.service";
import { CommentControllerBase } from "./base/comment.controller.base";

@swagger.ApiTags("comments")
@common.Controller("comments")
export class CommentController extends CommentControllerBase {
  constructor(
    protected readonly service: CommentService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
