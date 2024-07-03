import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { VendorServiceBase } from "./base/vendor.service.base";

@Injectable()
export class VendorService extends VendorServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
