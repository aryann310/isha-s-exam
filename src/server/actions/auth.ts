"use server";

import { compare } from "bcryptjs";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function loginAction(formData: FormData) {
  const identifier = ((formData.get("username") || formData.get("email") || "") as string).trim();
  const password = ((formData.get("password") || "") as string).trim();

  if (!identifier || !password) {
    return { error: "Username and password are required" };
  }

  try {
    // Find user by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { username: identifier.toLowerCase() },
          { email: identifier.toLowerCase() },
          { email: identifier },
          { name: identifier },
        ],
      },
    });

    if (!user || !user.isActive) {
      return { error: "Invalid username or password" };
    }

    const isValid = await compare(password, user.passwordHash);

    if (!isValid) {
      return { error: "Invalid username or password" };
    }

    await createSession(user.id, user.role, user.username || user.name, user.name);

    return { success: true, role: user.role };
  } catch (error: any) {
    console.error("Login error:", error);
    return { error: error?.message ? `Login failed: ${error.message}` : "An unexpected error occurred during login" };
  }
}
