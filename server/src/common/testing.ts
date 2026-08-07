import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import { PrismaClient } from "../generated/prisma/client";

export type PrismaMock = DeepMockProxy<PrismaClient>;

export function makePrismaMock(): PrismaMock {
  return mockDeep<PrismaClient>();
}
