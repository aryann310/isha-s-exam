import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PaperManager } from "@/components/admin/paper-manager";

export const dynamic = "force-dynamic";

export default async function AdminPapersPage({
  searchParams,
}: {
  searchParams: Promise<{ examId?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const resolvedSearchParams = await searchParams;

  const [exams, papers] = await Promise.all([
    prisma.exam.findMany({ orderBy: { name: "asc" } }),
    prisma.paper.findMany({
      include: {
        exam: true,
        _count: { select: { questions: true, attempts: true } },
        questions: { select: { section: true, questionNumber: true }, orderBy: { questionNumber: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div>

      <div className="w-full">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Paper Management</h2>
            <p className="text-sm text-slate-500 mt-1">
              Create, configure, and publish question papers across all examinations.
            </p>
          </div>
        </div>

        <PaperManager
          exams={exams}
          papers={papers}
          initialExamId={resolvedSearchParams?.examId}
        />
      </div>
    </div>
  );
}
