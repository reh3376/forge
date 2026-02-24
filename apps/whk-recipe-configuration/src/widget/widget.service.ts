import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WidgetServiceBase } from "./base/widget.service.base";

@Injectable()
export class WidgetService extends WidgetServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
