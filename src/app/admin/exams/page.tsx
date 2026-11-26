import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ExamManager } from "@/components/admin/exam-manager";

export const dynamic = "force-dynamic";

export default async function AdminExamsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const exams = await prisma.exam.findMany({
    include: {
      papers: {
        include: {
          _count: {
            select: { questions: true, attempts: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: { papers: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>

      <div className="w-full">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="font-heading text-3xl font-semibold text-slate-900">Exams</h1>
            <p className="text-sm text-slate-500 mt-1">
              Create, configure, and manage examinations like CMAT, SNAP, CAT, XAT, and publish question papers.
            </p>
          </div>
        </div>

        <ExamManager initialExams={exams} />
      </div>
    </div>
  );
}
