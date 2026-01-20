import { PrismaClient } from "../prisma/src/generated/client";

const globalForPrisma = global as unknown as {
    prisma: PrismaClient | undefined;
};

export const PRISMA_DB_CLIENT =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: ["query", "error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = PRISMA_DB_CLIENT;
}
