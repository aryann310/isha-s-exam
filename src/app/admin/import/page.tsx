import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ImportClient } from "@/components/admin/import-client";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const papers = await prisma.paper.findMany({
    include: { exam: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>

      <div className="max-w-5xl w-full">
        <div className="mb-8">
          <h1 className="font-heading text-3xl font-semibold text-slate-900">Bulk import</h1>
          <p className="text-sm text-slate-500 mt-1">
            Import existing PYQs in bulk directly into the database using JSON or CSV format.
          </p>
        </div>

        <ImportClient papers={papers} />
      </div>
    </div>
  );
}
