import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

export const PRISMA = Symbol("PRISMA");

export const prismaProvider = {
  provide: PRISMA,
  useFactory: (config: ConfigService): PrismaClient => {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow("DATABASE_URL"),
    });
    return new PrismaClient({ adapter });
  },
  inject: [ConfigService],
} satisfies FactoryProvider<PrismaClient>;
