import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { startExamAction } from "@/server/actions/exam";
import { getPattern, marksFor, patternInstructions, resolvePaperSections, sectionKey } from "@/lib/exam-patterns";
import { PALETTE_LABELS, PALETTE_ORDER, PaletteSymbol } from "@/components/exam/palette-symbol";
import { SectionOrderPicker } from "@/components/exam/section-order-picker";

export const dynamic = "force-dynamic";

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const markText = (m: { correct: number; incorrect: number }) => `${signed(m.correct)} / ${signed(m.incorrect)}`;

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

export default async function InstructionsPage({ params }: { params: Promise<{ paperId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { paperId } = await params;
  const isAdmin = session.role === "ADMIN";

  const paper = await prisma.paper.findFirst({
    where: { id: paperId, ...(isAdmin ? {} : { isActive: true, exam: { isActive: true } }) },
    include: { exam: true, questions: { select: { section: true, questionNumber: true, questionType: true } } },
  });
  if (!paper) return notFound();

  const running = await prisma.attempt.findFirst({
    where: { userId: session.userId as string, paperId: paper.id, status: "IN_PROGRESS" },
    select: { id: true },
  });
  if (running) redirect(`/exam/${running.id}`);

  const pattern = getPattern(paper.examPattern);
  const sections = resolvePaperSections(paper, paper.questions);
  const counts = new Map<string, number>();
  for (const q of paper.questions) counts.set(sectionKey(q.section), (counts.get(sectionKey(q.section)) ?? 0) + 1);
  // Marking per section (correct / wrong), with typed-answer questions listed separately when they differ.
  const sectionMarks = new Map<string, string>();
  let maxMarks = 0;
  for (const s of sections) {
    const qs = paper.questions.filter((q) => sectionKey(q.section) === s.name);
    const mcq = qs.filter((q) => q.questionType !== "TITA");
    const tita = qs.filter((q) => q.questionType === "TITA");
    const parts: string[] = [];
    if (mcq.length) parts.push(markText(marksFor(paper, "MCQ", s.name)));
    if (tita.length) parts.push(`${mcq.length ? "typed answers " : ""}${markText(marksFor(paper, "TITA", s.name))}`);
    sectionMarks.set(s.name, parts.join("; "));
    for (const q of qs) maxMarks += marksFor(paper, q.questionType, q.section).correct;
  }
  const sectional = pattern.timing === "sectional";
  const totalMinutes = sectional
    ? Math.round(sections.reduce((t, s) => t + (s.durationSeconds ?? 0), 0) / 60)
    : Math.round(paper.durationSeconds / 60);
  const chooseOrder = sectional && pattern.sectionOrder === "candidate" && sections.length > 1 && sections.length <= 4;
  const orders = chooseOrder ? permutations(sections.map((s) => s.name)) : [];
  const candidate = (session.name as string) || (session.username as string) || "Candidate";

  return (
    <div className="min-h-screen bg-[#f3f6f9] flex flex-col">
      <header className="bg-[#1f4e79] text-white px-6 py-3 flex justify-between items-center">
        <div>
          <p className="text-xs uppercase tracking-wider opacity-80">{paper.exam.name}</p>
          <h1 className="text-lg font-bold">{paper.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p className="opacity-80 text-xs">Candidate</p>
            <p className="font-semibold">{candidate}</p>
          </div>
          <div className="w-10 h-10 rounded bg-white/20 flex items-center justify-center text-lg font-bold">
            {candidate.slice(0, 1).toUpperCase()}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8">
        <div className="bg-white border border-gray-300 rounded shadow-sm">
          <h2 className="px-6 py-3 border-b border-gray-300 bg-gray-50 font-bold text-gray-900">General Instructions</h2>
          <div className="p-6 space-y-6 text-sm text-gray-800 leading-relaxed">
            <table className="w-full border border-gray-300 text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-3 py-2">Section</th>
                  <th className="border border-gray-300 px-3 py-2 w-28">Questions</th>
                  {sectional && <th className="border border-gray-300 px-3 py-2 w-28">Time</th>}
                  <th className="border border-gray-300 px-3 py-2">Marks (correct / wrong)</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.name}>
                    <td className="border border-gray-300 px-3 py-2">{s.name}</td>
                    <td className="border border-gray-300 px-3 py-2">{counts.get(s.name) ?? 0}</td>
                    {sectional && <td className="border border-gray-300 px-3 py-2">{Math.round((s.durationSeconds ?? 0) / 60)} min</td>}
                    <td className="border border-gray-300 px-3 py-2">{sectionMarks.get(s.name)}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2">Total</td>
                  <td className="border border-gray-300 px-3 py-2">{paper.questions.length}</td>
                  {sectional && <td className="border border-gray-300 px-3 py-2">{totalMinutes} min</td>}
                  <td className="border border-gray-300 px-3 py-2">{maxMarks} marks</td>
                </tr>
              </tbody>
            </table>
            {!sectional && (
              <p>
                <strong>Total time: {totalMinutes} minutes.</strong>
              </p>
            )}

            <ol className="list-decimal pl-5 space-y-2">
              {patternInstructions(pattern).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>

            <div>
              <p className="font-bold mb-3">
                {pattern.navigation === "linear" ? "The progress panel uses these symbols:" : "The question palette uses these symbols:"}
              </p>
              <ul className="grid sm:grid-cols-2 gap-3">
                {/* One-way papers have no marking for review. */}
                {PALETTE_ORDER.filter((st) => pattern.navigation !== "linear" || st === "answered" || st === "notAnswered" || st === "notVisited").map((st, i) => (
                  <li key={st} className="flex items-center gap-3">
                    <PaletteSymbol status={st} label={i + 1} size="sm" />
                    <span>{PALETTE_LABELS[st]}</span>
                  </li>
                ))}
              </ul>
            </div>

            <form action={startExamAction} className="border-t border-gray-200 pt-6 space-y-5">
              <input type="hidden" name="paperId" value={paper.id} />
              <input type="hidden" name="mode" value="MOCK" />

              {chooseOrder && <SectionOrderPicker orders={orders} />}

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" name="acceptInstructions" required className="mt-1 w-4 h-4" />
                <span>
                  I have read and understood the instructions. I agree that the test timer starts as soon as I click{" "}
                  <strong>I am ready to begin</strong>.
                </span>
              </label>

              <div className="flex justify-between items-center gap-3">
                <Link href={`/papers/${paper.id}`} className="text-sm text-gray-600 hover:text-black">
                  &larr; Previous
                </Link>
                <button type="submit" className="bg-[#1f4e79] hover:bg-[#173d60] text-white font-bold px-6 py-2.5 rounded">
                  I am ready to begin
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
