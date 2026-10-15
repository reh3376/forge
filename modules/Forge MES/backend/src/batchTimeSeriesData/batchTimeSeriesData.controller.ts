import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { BatchTimeSeriesDataService } from "./batchTimeSeriesData.service";
import { BatchTimeSeriesDataControllerBase } from "./base/batchTimeSeriesData.controller.base";

@swagger.ApiTags("batchTimeSeriesData")
@common.Controller("batchTimeSeriesData")
export class BatchTimeSeriesDataController extends BatchTimeSeriesDataControllerBase {
  constructor(
    protected readonly service: BatchTimeSeriesDataService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
