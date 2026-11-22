import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (prismaInstance) {
    return prismaInstance;
  }

  // The connection string lives only in the environment (Vercel project settings / local .env files).
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Server misconfigured: DATABASE_URL is not set.");
  }

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
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});

export default prisma;
