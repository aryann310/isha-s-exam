import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";

function getKey() {
  const secretKey = process.env.SESSION_SECRET || "default_super_secret_key_for_development";
  return new TextEncoder().encode(secretKey);
}

export async function encrypt(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getKey());
}

export async function decrypt(session: string | undefined = "") {
  try {
    const { payload } = await jwtVerify(session, getKey(), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, role: string, username?: string, name?: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({
    userId,
    role,
    username: username || "",
    name: name || "",
    expiresAt: expiresAt.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set("session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * The signed-in user, re-checked against the database on every request (cached for the request):
 * a deleted or deactivated account loses access at once, and the role always comes from the database,
 * never from the cookie alone. The middleware only checks the signature; this is the real gate.
 */
export const getSession = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  const payload = await decrypt(token);
  if (!payload || typeof payload.userId !== "string") return null;
  // Imported lazily so the middleware, which only needs `decrypt`, doesn't bundle the database client.
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, isActive: true, username: true, name: true },
  });
  if (!user || !user.isActive) return null;
  return { ...payload, userId: user.id, role: user.role, username: user.username || user.name, name: user.name };
});

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
