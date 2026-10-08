import { Pool } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const DEFAULT_DB_URL =
  "postgresql://neondb_owner:npg_RhHys3W8uGme@ep-plain-firefly-b3flr0pk-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (prismaInstance) {
    return prismaInstance;
  }

  const connectionString = process.env.DATABASE_URL || DEFAULT_DB_URL;

  try {
    const pool = new Pool({ connectionString });
    const adapter = new PrismaNeon(pool);
    prismaInstance = new PrismaClient({ adapter });
  } catch (err) {
    console.error("Failed to initialize PrismaNeon adapter:", err);
    prismaInstance = new PrismaClient();
  }

  return prismaInstance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = (client as any)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

export default prisma;
