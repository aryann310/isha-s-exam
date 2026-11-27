#!/usr/bin/env node
// Validates a Surprise Test paper (JSON) and loads it into the database, where it appears in the
// Surprise Test tab. See .claude/skills/surprise-paper/SKILL.md for the whole workflow and the file format.
//
//   node scripts/surprise/push-paper.mjs <paper.json> --check            validate only, no database
//   node scripts/surprise/push-paper.mjs <paper.json> --db test           load to the Neon test branch (.env.development.local)
//   node scripts/surprise/push-paper.mjs <paper.json> --db live --publish load to production and show it to students
//   node scripts/surprise/push-paper.mjs --list --db live                  list the surprise papers already loaded
//   node scripts/surprise/push-paper.mjs --close "Surprise Test 1" --db live --delete-after 24h
//                                         stop new attempts, open its solutions to all, delete it in 24 h
//
// Options: --publish (visible to students; default hidden), --replace (replace a paper with the same title
// that nobody has attempted yet).

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

export const SECTIONS = ["Quantitative Aptitude", "Verbal Ability", "Logical Reasoning", "Data Interpretation", "General Awareness"];
export const STYLES = ["CAT", "CMAT", "SNAP", "NMAT"];
export const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const QUESTION_COUNT = 30;
const DURATION_SECONDS = 3600;
const MARKS = { correct: 3, incorrect: -1 };
const EXAM = { slug: "surprise", name: "Surprise Test", description: "30 mixed questions from every subject, 60 minutes." };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

export function validatePaper(paper) {
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);

  if (!paper || typeof paper !== "object") return { errors: ["file: not a JSON object"], warnings };
  if (typeof paper.title !== "string" || !paper.title.trim()) err("title", "missing");
  const qs = Array.isArray(paper.questions) ? paper.questions : [];
  if (qs.length !== QUESTION_COUNT) err("questions", `need exactly ${QUESTION_COUNT}, found ${qs.length}`);

  const seen = new Set();
  qs.forEach((q, i) => {
    const at = `Q${i + 1}`;
    if (!SECTIONS.includes(q.section)) err(at, `section must be one of ${SECTIONS.join(" | ")} (got ${JSON.stringify(q.section)})`);
    if (!STYLES.includes(q.style)) err(at, `style must be one of ${STYLES.join(" | ")} (got ${JSON.stringify(q.style)})`);
    if (!DIFFICULTIES.includes(q.difficulty)) err(at, `difficulty must be one of ${DIFFICULTIES.join(" | ")}`);
    if (typeof q.topic !== "string" || !q.topic.trim()) err(at, "topic missing");
    if (typeof q.question !== "string" || q.question.trim().length < 15) err(at, "question text missing or too short");
    if (typeof q.solution !== "string" || q.solution.trim().length < 20) err(at, "solution missing or too short (explain the working)");
    if (typeof q.source !== "string" || !q.source.trim()) err(at, "source missing (a URL, or \"original\")");

    const opts = q.options && typeof q.options === "object" && !Array.isArray(q.options) ? q.options : null;
    if (!opts) {
      err(at, "options must be an object like {\"A\": \"...\", \"B\": \"...\"}");
    } else {
      const keys = Object.keys(opts);
      const expected = "ABCDE".slice(0, keys.length).split("");
      if (keys.length < 4 || keys.length > 5 || keys.join("") !== expected.join("")) err(at, `options must be A–D or A–E in order (got ${keys.join(",")})`);
      const values = keys.map((k) => String(opts[k] ?? "").trim());
      if (values.some((v) => !v)) err(at, "an option is empty");
      const norm = values.map((v) => v.toLowerCase().replace(/\s+/g, " "));
      if (new Set(norm).size !== norm.length) err(at, "two options are the same");
      if (!keys.includes(q.answer)) err(at, `answer ${JSON.stringify(q.answer)} is not one of the options`);
      for (const v of values) if (CONTROL.test(v)) err(at, "control character in an option (lost backslash in LaTeX?)");
    }
    for (const field of ["question", "solution"]) {
      if (typeof q[field] === "string" && CONTROL.test(q[field])) err(at, `control character in ${field} (lost backslash in LaTeX?)`);
    }
    if (typeof q.question === "string") {
      const key = q.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) err(at, "duplicate of an earlier question");
      seen.add(key);
    }
    // The solution must end by naming the keyed option, so a key/solution mismatch is caught here.
    if (opts && typeof q.solution === "string") {
      const named = [...q.solution.matchAll(/answer\s*[:-]\s*\**\s*\(?\s*([A-E])\b/gi)].map((m) => m[1].toUpperCase());
      if (!named.length) err(at, `solution must end with "Answer: ${q.answer}"`);
      else if (named[named.length - 1] !== q.answer) err(at, `solution says Answer ${named[named.length - 1]} but the key is ${q.answer}`);
    }
  });

  // The mix the Surprise Test promises: every exam style, most subjects, every difficulty.
  if (qs.length) {
    const count = (field, value) => qs.filter((q) => q[field] === value).length;
    for (const s of STYLES) if (!count("style", s)) err("mix", `no ${s}-style question`);
    for (const d of DIFFICULTIES) if (!count("difficulty", d)) err("mix", `no ${d} question`);
    const sections = SECTIONS.filter((s) => count("section", s));
    if (sections.length < 4) err("mix", `only ${sections.length} subjects covered; use at least 4 of ${SECTIONS.join(", ")}`);
    const answers = "ABCDE".split("").map((k) => qs.filter((q) => q.answer === k).length);
    if (Math.max(...answers) > 12) warnings.push(`mix: answer keys are lopsided (A–E counts ${answers.join("/")})`);
  }
  return { errors, warnings };
}

/** Questions in section order (the order the tabs appear), numbered 1..30. */
export function orderedQuestions(paper) {
  const rank = (q) => SECTIONS.indexOf(q.section);
  return paper.questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => rank(a.q) - rank(b.q) || a.i - b.i)
    .map(({ q }, n) => ({ ...q, number: n + 1 }));
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function databaseUrl(target) {
  const file = target === "live" ? ".env" : target === "test" ? ".env.development.local" : null;
  if (!file) throw new Error('--db must be "test" or "live"');
  // The env files live in the main checkout; a worktree may not have them.
  const candidates = [resolve(ROOT, file), resolve(ROOT, "..", "EXAM-SYSTEM", file)];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error(`${file} not found`);
  const line = readFileSync(path, "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) throw new Error(`DATABASE_URL not set in ${file}`);
  let url = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
  // Neon computes sleep; give a cold start time to wake.
  if (!/connect_timeout=/.test(url)) url += (url.includes("?") ? "&" : "?") + "connect_timeout=60&pool_timeout=60";
  return url;
}

async function push(paper, { target, publish, replace }) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl(target) } } });
  try {
    const questions = orderedQuestions(paper);
    const sectionConfig = SECTIONS.filter((s) => questions.some((q) => q.section === s)).map((name) => ({ name, durationSeconds: null }));

    const result = await prisma.$transaction(
      async (tx) => {
        const exam =
          (await tx.exam.findUnique({ where: { slug: EXAM.slug } })) ??
          (await tx.exam.create({ data: { ...EXAM, isActive: true } }));
        if (publish && !exam.isActive) await tx.exam.update({ where: { id: exam.id }, data: { isActive: true } });

        const existing = await tx.paper.findFirst({ where: { examId: exam.id, title: paper.title.trim() }, include: { _count: { select: { attempts: true } } } });
        if (existing) {
          if (!replace) throw new Error(`A surprise paper titled "${paper.title}" already exists (${existing.id}). Use a new title, or --replace.`);
          if (existing._count.attempts > 0) throw new Error(`"${paper.title}" has ${existing._count.attempts} attempt(s); it cannot be replaced. Use a new title.`);
          await tx.paper.delete({ where: { id: existing.id } });
        }

        // Never repeat a question that an earlier surprise paper already used.
        const earlier = await tx.question.findMany({ where: { paper: { examId: exam.id } }, select: { questionText: true } });
        const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const used = new Set(earlier.map((q) => norm(q.questionText)));
        const repeats = questions.filter((q) => used.has(norm(q.question))).map((q) => q.number);
        if (repeats.length) throw new Error(`Question(s) ${repeats.join(", ")} already appeared in an earlier surprise paper.`);

        const created = await tx.paper.create({
          data: {
            examId: exam.id,
            title: paper.title.trim(),
            year: 0,
            description: paper.description?.trim() || null,
            durationSeconds: DURATION_SECONDS,
            totalQuestions: questions.length,
            isActive: !!publish,
            correctMarks: MARKS.correct,
            incorrectMarks: MARKS.incorrect,
            unattemptedMarks: 0,
            examPattern: "SURPRISE",
            sectionConfig: JSON.stringify(sectionConfig),
          },
        });
        await tx.question.createMany({
          data: questions.map((q) => ({
            paperId: created.id,
            questionNumber: q.number,
            questionText: q.question.trim(),
            section: q.section,
            topic: `${q.style}-style · ${q.topic.trim()}`,
            difficulty: q.difficulty,
            questionType: "MCQ",
            options: JSON.stringify(Object.fromEntries(Object.entries(q.options).map(([k, v]) => [k, String(v).trim()]))),
            correctAnswer: q.answer,
            explanation: q.solution.trim(),
          })),
        });
        return created;
      },
      { timeout: 60_000, maxWait: 30_000 }
    );

    // Read back what was stored, so the report reflects the database, not the file.
    const stored = await prisma.question.findMany({ where: { paperId: result.id }, orderBy: { questionNumber: "asc" }, select: { questionNumber: true, correctAnswer: true, section: true } });
    const keyOk = stored.length === questions.length && stored.every((s, i) => s.correctAnswer === questions[i].answer && s.section === questions[i].section);
    if (!keyOk) throw new Error("Read-back mismatch: stored questions differ from the file.");
    return { paperId: result.id, questions: stored.length, published: !!publish };
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Lists the surprise papers already in a database, so a new paper gets the next title. */
async function list(target) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl(target) } } });
  try {
    const papers = await prisma.paper.findMany({
      where: { exam: { slug: EXAM.slug } },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, isActive: true, createdAt: true, closedAt: true, deleteAt: true, _count: { select: { questions: true, attempts: true } } },
    });
    if (!papers.length) console.log(`No surprise papers in ${target.toUpperCase()} yet.`);
    for (const p of papers) {
      const state = p.closedAt ? `closed${p.deleteAt ? `, deletes ${p.deleteAt.toISOString().slice(0, 16)}Z` : ""}` : p.isActive ? "published" : "hidden";
      console.log(`${p.title.padEnd(24)} ${state.padEnd(36)} ${p._count.questions} Q  ${p._count.attempts} attempts  ${p.createdAt.toISOString().slice(0, 10)}  ${p.id}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Closes a surprise paper: no new attempts from now, its solutions open to every student, and (with a delete
 * time) the whole paper and its attempts are deleted automatically after that many hours.
 */
async function close(target, title, deleteAfterHours) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl(target) } } });
  try {
    const paper = await prisma.paper.findFirst({
      where: { exam: { slug: EXAM.slug }, title },
      select: { id: true, title: true, closedAt: true, _count: { select: { attempts: true } } },
    });
    if (!paper) throw new Error(`No surprise paper titled "${title}" in ${target.toUpperCase()}.`);
    const running = await prisma.attempt.count({ where: { paperId: paper.id, status: "IN_PROGRESS" } });
    const now = new Date();
    const deleteAt = deleteAfterHours ? new Date(now.getTime() + deleteAfterHours * 3600_000) : null;
    await prisma.paper.update({ where: { id: paper.id }, data: { closedAt: paper.closedAt ?? now, deleteAt } });
    console.log(`Closed "${paper.title}" in ${target.toUpperCase()} (${paper._count.attempts} attempts, ${running} still running and allowed to finish).`);
    console.log(deleteAt ? `It will be deleted with all its attempts at ${deleteAt.toISOString()} (${deleteAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST).` : "No delete time set.");
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--close")) {
    const target = args.includes("--db") ? args[args.indexOf("--db") + 1] : null;
    const title = args[args.indexOf("--close") + 1];
    const hours = args.includes("--delete-after") ? Number(String(args[args.indexOf("--delete-after") + 1]).replace(/h$/i, "")) : null;
    if (!target || !title || title.startsWith("--") || (hours !== null && !(hours > 0))) {
      console.error('Usage: node scripts/surprise/push-paper.mjs --close "<title>" --db test|live [--delete-after 24h]');
      process.exit(2);
    }
    return close(target, title, hours);
  }
  if (args.includes("--list")) {
    const target = args.includes("--db") ? args[args.indexOf("--db") + 1] : "live";
    return list(target);
  }
  const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--db");
  const flag = (name) => args.includes(`--${name}`);
  const target = args.includes("--db") ? args[args.indexOf("--db") + 1] : null;
  if (!file || (!flag("check") && !target)) {
    console.error("Usage: node scripts/surprise/push-paper.mjs <paper.json> (--check | --db test|live [--publish] [--replace])");
    process.exit(2);
  }

  const paper = JSON.parse(readFileSync(resolve(file), "utf8"));
  const { errors, warnings } = validatePaper(paper);
  for (const w of warnings) console.warn(`warning  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error    ${e}`);
    console.error(`\n${errors.length} problem(s); nothing was loaded.`);
    process.exit(1);
  }
  const qs = orderedQuestions(paper);
  const tally = (field, values) => values.map((v) => `${v} ${qs.filter((q) => q[field] === v).length}`).join(", ");
  console.log(`OK  "${paper.title}" — ${qs.length} questions`);
  console.log(`    subjects:     ${tally("section", SECTIONS)}`);
  console.log(`    styles:       ${tally("style", STYLES)}`);
  console.log(`    difficulty:   ${tally("difficulty", DIFFICULTIES)}`);
  console.log(`    answer keys:  ${tally("answer", ["A", "B", "C", "D", "E"])}`);
  if (flag("check")) return;

  const res = await push(paper, { target, publish: flag("publish"), replace: flag("replace") });
  console.log(`\nLoaded to ${target.toUpperCase()}: paper ${res.paperId}, ${res.questions} questions, ${res.published ? "PUBLISHED (in the Surprise Test tab)" : "hidden (add --publish to show students)"}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`\nFailed: ${e.message}`);
    process.exit(1);
  });
}
