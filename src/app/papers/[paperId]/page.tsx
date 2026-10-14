import { getSession, deleteSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { startExamAction } from "@/server/actions/exam";

export const dynamic = "force-dynamic";

export default async function PaperInfoPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedParams = await params;
  const isAdmin = session.role === "ADMIN";

  const param = decodeURIComponent(resolvedParams.paperId).trim();
  const words = param.toLowerCase().split(/[\s-]+/).filter(Boolean);

  let paper = await prisma.paper.findFirst({
    where: {
      OR: [
        { id: param },
        { title: { contains: param, mode: "insensitive" } },
      ],
      ...(isAdmin ? {} : { isActive: true }),
    },
    include: {
      exam: true,
      questions: {
        select: { section: true },
      },
    },
  });

  // Smart fallback: match by word tokens (e.g. "snap", "2024", "pyq")
  if (!paper && words.length > 0) {
    const allPapers = await prisma.paper.findMany({
      where: isAdmin ? {} : { isActive: true },
      include: {
        exam: true,
        questions: { select: { section: true } },
      },
    });
    paper =
      allPapers.find((p) => {
        const fullText = `${p.title} ${p.exam.name} ${p.exam.slug}`.toLowerCase();
        return words.every((w) => fullText.includes(w));
      }) || null;
  }

  if (!paper) return notFound();

  // Extract unique sections
  const sections = Array.from(
    new Set(paper.questions.map((q) => q.section).filter(Boolean))
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href={`/exams/${paper.exam.slug}`} className="text-sm font-medium text-gray-500 hover:text-black">
            &larr; Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{paper.exam.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Logged in</span>
          <form
            action={async () => {
              "use server";
              await deleteSession();
              redirect("/login");
            }}
          >
            <button className="text-sm font-medium text-gray-700 hover:text-black">
              Logout
            </button>
          </form>
        </div>
      </header>
      
      <main className="flex-1 max-w-3xl w-full mx-auto p-6 md:p-12">
        <div className="bg-white border border-gray-200 rounded-xl p-8 md:p-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{paper.title}</h2>
          <p className="text-gray-500 mb-8">Previous Year Question Paper</p>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Questions</p>
              <p className="text-2xl font-semibold text-gray-900">{paper.totalQuestions}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Duration</p>
              <p className="text-2xl font-semibold text-gray-900">{Math.round(paper.durationSeconds / 60)} Minutes</p>
            </div>
          </div>

          {sections.length > 0 && (
            <div className="mb-10">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Sections</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                {sections.map((section, idx) => (
                  <li key={idx}>{section}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-gray-100 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">Choose Mode</h3>
            
            <form action={startExamAction} className="grid sm:grid-cols-2 gap-4">
              <input type="hidden" name="paperId" value={paper.id} />
              
              <button
                type="submit"
                name="mode"
                value="PRACTICE"
                className="w-full bg-white text-gray-900 border-2 border-gray-900 hover:bg-gray-50 p-6 rounded-xl font-bold text-left transition-all hover:shadow-sm"
              >
                <div className="text-lg font-black text-gray-950 mb-1">PRACTICE MODE</div>
                <div className="text-xs font-medium text-gray-600">
                  Select answer &rarr; Click Confirm &rarr; View on-the-spot solution &rarr; Click Next.
                </div>
              </button>
              
              <button
                type="submit"
                name="mode"
                value="MOCK"
                className="w-full bg-gray-900 text-white hover:bg-gray-800 p-6 rounded-xl font-bold text-left transition-all hover:shadow-md"
              >
                <div className="text-lg font-black text-white mb-1">MOCK TEST MODE</div>
                <div className="text-xs font-medium text-gray-300">
                  Timed exam simulation. Answers and solutions revealed after final submission.
                </div>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
