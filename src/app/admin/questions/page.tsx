import { getSession } from "@/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createQuestionAction, updateQuestionAction, deleteQuestionAction } from "@/server/actions/admin";
import { renderMarkdownWithMath } from "@/lib/render-markdown";

const prisma = new PrismaClient();

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
        orderBy: { questionNumber: "asc" },
      })
    : [];

  const currentPaper = papers.find((p) => p.id === selectedPaperId);
  const editingQuestion = resolvedParams.editId
    ? questions.find((q) => q.id === resolvedParams.editId)
    : null;

  let editOptions: Record<string, string> = { A: "", B: "", C: "", D: "" };
  if (editingQuestion) {
    try {
      editOptions = JSON.parse(editingQuestion.options);
    } catch (e) {}
  }

  const nextQuestionNumber =
    questions.length > 0
      ? Math.max(...questions.map((q) => q.questionNumber)) + 1
      : 1;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-gray-950 text-white px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-lg font-black tracking-wider flex items-center gap-2">
            <span className="bg-white text-gray-950 px-2 py-0.5 rounded font-black text-sm">ADMIN</span>
            EXAM PORTAL
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-gray-300">
            <Link href="/admin" className="hover:text-white transition-colors">
              Overview
            </Link>
            <Link href="/admin/papers" className="hover:text-white transition-colors">
              Papers
            </Link>
            <Link href="/admin/questions" className="text-white font-bold border-b-2 border-white pb-1">
              Questions
            </Link>
            <Link href="/admin/import" className="hover:text-white transition-colors">
              Bulk Import
            </Link>
            <Link href="/admin/results" className="hover:text-white transition-colors">
              Student Results
            </Link>
            <Link href="/admin/users" className="hover:text-white transition-colors">
              Users
            </Link>
          </nav>
        </div>
        <Link href="/admin" className="text-xs text-gray-400 hover:text-white">
          &larr; Back to Dashboard
        </Link>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Question Bank</h2>
            <p className="text-sm text-gray-500 mt-1">
              Add, edit, inspect, and manage individual questions for each examination paper.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">Select Paper:</span>
            <form method="GET" action="/admin/questions" className="flex items-center gap-2">
              <select
                name="paperId"
                defaultValue={selectedPaperId}
                className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm font-bold text-gray-900 shadow-xs focus:ring-2 focus:ring-gray-900 outline-none"
              >
                {papers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.exam.name} - {p.title}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="text-xs bg-gray-900 text-white font-bold px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Switch
              </button>
            </form>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Question Form (Create / Edit) */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs h-fit">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-lg font-bold text-gray-900">
                {editingQuestion
                  ? `Edit Question #${editingQuestion.questionNumber}`
                  : "Add Question"}
              </h3>
              {editingQuestion && (
                <Link
                  href={`/admin/questions?paperId=${selectedPaperId}`}
                  className="text-xs text-rose-600 hover:underline font-semibold"
                >
                  Cancel Edit
                </Link>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {editingQuestion ? "Updating question in:" : "Adding to:"}{" "}
              <span className="font-semibold text-gray-800">{currentPaper?.title}</span>
            </p>

            <form
              key={editingQuestion ? editingQuestion.id : "new"}
              action={editingQuestion ? updateQuestionAction : createQuestionAction}
              className="space-y-4 text-xs font-semibold"
            >
              {editingQuestion ? (
                <input type="hidden" name="id" value={editingQuestion.id} />
              ) : (
                <input type="hidden" name="paperId" value={selectedPaperId} />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1">Question Number</label>
                  <input
                    name="questionNumber"
                    type="number"
                    defaultValue={editingQuestion ? editingQuestion.questionNumber : nextQuestionNumber}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Difficulty</label>
                  <select
                    name="difficulty"
                    defaultValue={editingQuestion?.difficulty || "Medium"}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-gray-900 outline-none"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1">Section</label>
                  <input
                    name="section"
                    placeholder="e.g. Quantitative Techniques"
                    defaultValue={editingQuestion?.section || "Quantitative Techniques"}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1">Topic</label>
                  <input
                    name="topic"
                    placeholder="e.g. Percentages"
                    defaultValue={editingQuestion?.topic || ""}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Question Text (Supports HTML/Text)</label>
                <textarea
                  name="questionText"
                  rows={3}
                  required
                  defaultValue={editingQuestion?.questionText || ""}
                  placeholder="Enter question statement..."
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              {/* Options */}
              <div className="space-y-2">
                <label className="block text-gray-700">Answer Options</label>
                {(["A", "B", "C", "D"] as const).map((optKey) => (
                  <div key={optKey} className="flex items-center gap-2">
                    <span className="font-bold text-gray-700 w-5">{optKey}:</span>
                    <input
                      name={`option${optKey}`}
                      placeholder={`Option ${optKey} text`}
                      defaultValue={editOptions[optKey] || ""}
                      required
                      className="flex-1 border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Correct Answer Key</label>
                <select
                  name="correctAnswer"
                  defaultValue={editingQuestion?.correctAnswer || "A"}
                  className="w-full border border-gray-300 rounded-lg p-2.5 bg-white text-sm font-bold focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Detailed Solution / Explanation</label>
                <textarea
                  name="explanation"
                  rows={3}
                  defaultValue={editingQuestion?.explanation || ""}
                  placeholder="Step-by-step solution shown in Practice mode and post-exam review..."
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors text-sm shadow-sm"
                >
                  {editingQuestion ? "Save Changes" : "+ Add Question"}
                </button>
                {editingQuestion && (
                  <Link
                    href={`/admin/questions?paperId=${selectedPaperId}`}
                    className="border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-50 text-sm text-center"
                  >
                    Cancel
                  </Link>
                )}
              </div>
            </form>
          </div>

          {/* Questions List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">
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
              <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center text-sm text-gray-500">
                No questions found in this paper. Use the form on the left or Bulk Import to add questions.
              </div>
            ) : (
              questions.map((q) => {
                let opts: Record<string, string> = {};
                try {
                  opts = JSON.parse(q.options);
                } catch (e) {}

                const isCurrentlyEditing = q.id === editingQuestion?.id;

                return (
                  <div
                    key={q.id}
                    className={`bg-white p-5 rounded-2xl border shadow-xs space-y-3 transition-colors ${
                      isCurrentlyEditing
                        ? "border-blue-600 ring-2 ring-blue-100"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-gray-900 text-white text-xs font-black px-2.5 py-1 rounded">
                          Q{q.questionNumber}
                        </span>
                        {q.section && (
                          <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full">
                            {q.section}
                          </span>
                        )}
                        {q.difficulty && (
                          <span className="text-xs text-gray-400">
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
                      className="text-sm font-medium text-gray-900 prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.questionText) }}
                    />

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(opts).map(([key, val]) => (
                        <div
                          key={key}
                          className={`p-2 rounded border flex items-start gap-1.5 ${
                            q.correctAnswer === key
                              ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                              : "bg-gray-50 border-gray-200 text-gray-700"
                          }`}
                        >
                          <span className="font-bold">{key}:</span>
                          <span dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(val as string) }} />
                        </div>
                      ))}
                    </div>

                    {q.explanation && (
                      <div className="text-xs bg-gray-50 p-2.5 rounded border border-gray-200 text-gray-600 prose max-w-none">
                        <strong className="text-gray-900">Explanation: </strong>
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(q.explanation) }} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
