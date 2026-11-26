"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, deleteSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const GENERIC = "Invalid username or password";
// A real bcrypt hash of a random string, so failed lookups take as long as real password checks
// and the response time doesn't reveal which usernames exist.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.oEJ5Iq4v6UmpfS2vzKcKbI1nU8yq";

export async function loginAction(formData: FormData) {
  const identifier = String(formData.get("username") || formData.get("email") || "").trim();
  // Passwords are used exactly as typed (accounts are created that way too).
  const password = String(formData.get("password") || "");

  if (!identifier || !password) {
    return { error: "Username and password are required" };
  }

  try {
    // Sign in with a username or email address (both unique).
    const lower = identifier.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { username: lower }, { email: lower }] },
      orderBy: { createdAt: "asc" },
    });

    const isValid = await compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.isActive || !isValid) {
      return { error: GENERIC };
    }

    await createSession(user.id, user.role, user.username || user.name, user.name);
    return { success: true, role: user.role };
  } catch (error: unknown) {
    console.error("Login error:", error);
    return { error: "Sign-in failed because of a server problem. Please try again." };
  }
}

export async function logoutAction() {
  await deleteSession();
  redirect("/login");
}
