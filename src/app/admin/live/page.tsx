import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPattern } from "@/lib/exam-patterns";
import { getLiveSnapshot } from "@/server/admin-data";
import { LiveProctor } from "@/components/admin/live-proctor";

export const dynamic = "force-dynamic";

export default async function AdminLiveProctorPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const [snapshot, students, papers] = await Promise.all([
    getLiveSnapshot(),
    prisma.user.findMany({
      where: { role: "STUDENT", isActive: true },
      select: { id: true, name: true, email: true, username: true },
      orderBy: { name: "asc" },
    }),
    prisma.paper.findMany({
      select: { id: true, title: true, durationSeconds: true, isActive: true, examPattern: true, exam: { select: { name: true, isActive: true } } },
      orderBy: [{ year: "desc" }, { title: "asc" }],
    }),
  ]);

  return (
    <LiveProctor
      initial={snapshot}
      students={students.map((s) => ({ id: s.id, name: s.name, handle: s.username || s.email }))}
      papers={papers.map((p) => ({
        id: p.id,
        title: p.title,
        exam: p.exam.name,
        minutes: Math.round(p.durationSeconds / 60),
        published: p.isActive && p.exam.isActive,
        sectional: getPattern(p.examPattern).timing === "sectional",
      }))}
    />
  );
}
