import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { startExamAction } from "@/server/actions/exam";
import { getPattern, resolvePaperSections } from "@/lib/exam-patterns";
import { themeForPaper } from "@/lib/exam-theme";
import { SiteHeader } from "@/components/site/site-header";

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
      ...(isAdmin ? {} : { isActive: true, exam: { isActive: true } }),
    },
    include: {
      exam: true,
      questions: {
        select: { section: true, questionNumber: true },
      },
    },
  });

  // Smart fallback: match by word tokens (e.g. "snap", "2024", "pyq")
  if (!paper && words.length > 0) {
    const allPapers = await prisma.paper.findMany({
      where: isAdmin ? {} : { isActive: true, exam: { isActive: true } },
      include: {
        exam: true,
        questions: { select: { section: true, questionNumber: true } },
      },
    });
    paper =
      allPapers.find((p) => {
        const fullText = `${p.title} ${p.exam.name} ${p.exam.slug}`.toLowerCase();
        return words.every((w) => fullText.includes(w));
      }) || null;
  }

  if (!paper) return notFound();

  const pattern = getPattern(paper.examPattern);
  const sections = resolvePaperSections(paper, paper.questions);
  const counts = new Map<string, number>();
  for (const q of paper.questions) {
    const k = q.section && q.section.trim() ? q.section.trim() : "General";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const mockMinutes =
    pattern.timing === "sectional"
      ? Math.round(sections.reduce((t, s) => t + (s.durationSeconds ?? 0), 0) / 60)
      : Math.round(paper.durationSeconds / 60);

  const name = (session.username as string) || (session.name as string) || "Student";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SiteHeader name={name} isAdmin={isAdmin} back={{ href: `/exams/${paper.exam.slug}`, label: `${paper.exam.name} papers` }} />

      <main data-exam-theme={themeForPaper(paper, paper.exam.name)} className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="bg-exam-dark text-white px-6 sm:px-8 py-6">
            <span className="inline-block px-2 py-1 rounded bg-white text-exam-dark text-xs font-bold leading-none font-exam">{pattern.label}</span>
            <h1 className="font-exam text-2xl sm:text-3xl font-bold mt-3">{paper.title}</h1>
            <p className="text-exam-on-dark text-sm mt-2 leading-relaxed">{pattern.summary}</p>
          </div>

          <div className="p-6 sm:p-8 space-y-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-exam-tint border border-exam-line p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-1">Questions</p>
                <p className="text-2xl font-semibold text-gray-900 tabular-nums">{paper.totalQuestions}</p>
              </div>
              <div className="bg-exam-tint border border-exam-line p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-1">Time</p>
                <p className="text-2xl font-semibold text-gray-900 tabular-nums">{mockMinutes} min</p>
              </div>
            </div>

            {sections.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-900 mb-3">Sections</h2>
                <ul className="divide-y divide-gray-200 border border-gray-200 rounded-xl text-sm">
                  {sections.map((section) => (
                    <li key={section.name} className="flex justify-between gap-4 px-4 py-3">
                      <span className="text-gray-900">{section.name}</span>
                      <span className="text-gray-600 shrink-0">
                        {counts.get(section.name) ?? 0} questions
                        {section.durationSeconds ? ` · ${Math.round(section.durationSeconds / 60)} min` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-gray-200 pt-8">
              <h2 className="font-heading text-2xl font-semibold text-gray-900 mb-4">How do you want to take it?</h2>

              <form action={startExamAction} className="grid sm:grid-cols-2 gap-4">
                <input type="hidden" name="paperId" value={paper.id} />

                <button
                  type="submit"
                  name="mode"
                  value="PRACTICE"
                  className="w-full bg-white text-gray-900 border-2 border-gray-300 hover:border-exam-primary p-5 rounded-xl text-left transition-colors"
                >
                  <span className="block text-lg font-bold text-gray-900 mb-1">Practice</span>
                  <span className="block text-sm text-gray-600 leading-relaxed">
                    Pick an answer, confirm it, and see the solution straight away, one question at a time.
                  </span>
                </button>

                <Link
                  href={`/papers/${paper.id}/instructions`}
                  className="w-full bg-exam-primary hover:bg-exam-primary-hover text-white p-5 rounded-xl text-left transition-colors"
                >
                  <span className="block text-lg font-bold mb-1">Mock test</span>
                  <span className="block text-sm text-white/85 leading-relaxed">
                    {pattern.navigation === "linear"
                      ? `Real ${pattern.label} conditions: timed sections, one question at a time, no going back. Answers and solutions after you submit.`
                      : `Real ${pattern.label} conditions: timer, question palette, Mark for Review. Answers and solutions after you submit.`}
                  </span>
                </Link>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
