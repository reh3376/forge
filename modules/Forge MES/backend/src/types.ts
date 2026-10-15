import type { JsonValue } from "type-fest";
import { Prisma } from "@prisma/client";

export type InputJsonValue = Omit<JsonValue, "null">;

// For non-nullable JSON fields in Prisma
export type PrismaJsonValue = Prisma.JsonNullValueInput | InputJsonValue;

// For nullable JSON fields in Prisma
export type PrismaNullableJsonValue =
  | Prisma.JsonNullValueInput
  | InputJsonValue
  | null;
