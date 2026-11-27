import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/ui";
import { StudentManager } from "@/components/admin/student-manager";
import { formatDate } from "@/lib/admin-format";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      advisorLimitRequestedAt: true,
      _count: { select: { attempts: true } },
    },
  });

  return (
    <>
      <PageHeader title="Students" description="Add students, and revoke or restore their access. Revoking takes effect immediately and keeps their history." />
      <StudentManager
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          attempts: u._count.attempts,
          joined: formatDate(u.createdAt),
          advisorRequested: !!u.advisorLimitRequestedAt,
        }))}
      />
    </>
  );
}
