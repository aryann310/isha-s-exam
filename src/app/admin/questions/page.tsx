import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { deleteQuestionAction } from "@/server/actions/admin";
import { renderMarkdownWithMath } from "@/lib/render-markdown";
import { parseQuestionOptions } from "@/lib/parse-markdown-questions";
import { QuestionEditorForm } from "@/components/admin/question-editor-form";

export const dynamic = "force-dynamic";

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ paperId?: string; editId?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const resolvedParams = await searchParams;
  const papers = await prisma.paper.findMany({
    include: { exam: true },
    orderBy: { createdAt: "desc" },
  });

  const selectedPaperId = resolvedParams.paperId || (papers.length > 0 ? papers[0].id : "");

  const questions = selectedPaperId
    ? await prisma.question.findMany({
        where: { paperId: selectedPaperId },
        orderBy: [{ questionNumber: "asc" }, { id: "asc" }],
      })
    : [];

  const currentPaper = papers.find((p) => p.id === selectedPaperId);
  const editingQuestion = resolvedParams.editId
    ? questions.find((q) => q.id === resolvedParams.editId)
    : null;

  const editOptions = editingQuestion
    ? parseQuestionOptions(editingQuestion.options)
    : { A: "", B: "", C: "", D: "" };

  const nextQuestionNumber =
    questions.length > 0
      ? Math.max(...questions.map((q) => q.questionNumber)) + 1
      : 1;

  return (
    <div>

      <div className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold text-slate-900">Questions</h1>
            <p className="text-sm text-slate-500 mt-1">
              Add, edit, inspect, and manage individual questions for each examination paper.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Select Paper:</span>
            <form method="GET" action="/admin/questions" className="flex items-center gap-2">
              <select
                name="paperId"
                defaultValue={selectedPaperId}
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm font-bold text-slate-900 shadow-xs focus:ring-2 focus:ring-slate-900 outline-none"
              >
                {papers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.exam.name} - {p.title}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="text-xs bg-slate-900 text-white font-bold px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Switch
              </button>
            </form>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Question Form (Create / Edit with Integrated Diagram Support) */}
          <QuestionEditorForm
            key={editingQuestion ? `edit-${editingQuestion.id}` : `new-${selectedPaperId}-${nextQuestionNumber}`}
            paperId={selectedPaperId}
            currentPaperTitle={currentPaper?.title}
            editingQuestion={editingQuestion}
            nextQuestionNumber={nextQuestionNumber}
            initialOptions={editOptions}
          />

          {/* Questions List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">
                Loaded Questions ({questions.length})
              </h3>
              <Link
                href="/admin/import"
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Bulk Import JSON/CSV &rarr;
              </Link>
            </div>

            {questions.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-sm text-slate-500">
                No questions found in this paper. Use the form on the left or Bulk Import to add questions.
              </div>
            ) : (
              questions.map((q) => {
                const opts = parseQuestionOptions(q.options);

                const isCurrentlyEditing = q.id === editingQuestion?.id;

                return (
                  <div
                    key={q.id}
                    className={`bg-white p-5 rounded-xl border shadow-xs space-y-3 transition-colors ${
                      isCurrentlyEditing
                        ? "border-blue-600 ring-2 ring-blue-100"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-900 text-white text-xs font-semibold px-2.5 py-1 rounded">
                          Q{q.questionNumber}
                        </span>
                        {q.section && (
                          <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
                            {q.section}
                          </span>
                        )}
                        {q.difficulty && (
                          <span className="text-xs text-slate-400">
                            [{q.difficulty}]
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/questions?paperId=${selectedPaperId}&editId=${q.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-bold px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          Edit
                        </Link>

                        <form
                          action={async () => {
                            "use server";
                            await deleteQuestionAction(q.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>

                    <div
                      className="text-sm font-medium text-slate-900 prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.questionText) }}
                    />

                    {q.questionType === "TITA" ? (
                      <div className="p-2 rounded border text-xs bg-emerald-50 border-emerald-300 text-emerald-900 font-bold">
                        Typed answer (TITA): <span className="font-mono">{q.correctAnswer.split("|").join(" or ")}</span>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(opts).map(([key, val]) => (
                        <div
                          key={key}
                          className={`p-2 rounded border flex items-start gap-1.5 ${
                            q.correctAnswer === key
                              ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                              : "bg-slate-50 border-slate-200 text-slate-700"
                          }`}
                        >
                          <span className="font-bold">{key}:</span>
                          <span dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(val as string) }} />
                        </div>
                      ))}
                    </div>
                    )}

                    {q.explanation && (
                      <div className="text-xs bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-600 prose max-w-none">
                        <strong className="text-slate-900">Explanation: </strong>
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.explanation) }} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
