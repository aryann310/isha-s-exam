---
name: surprise-paper
description: Make a new Surprise Test paper (30 mixed questions, CAT/CMAT/SNAP/NMAT style, all subjects and difficulties, 60 minutes) and push it to the live Surprise Test tab. Use whenever the user asks to make, create, generate or push a surprise test / surprise paper / surprise exam.
---

# Make and push a Surprise Test paper

The Surprise Test tab (`/surprise`) lists papers from the exam with slug `surprise`, pattern `SURPRISE`
(`src/lib/exam-patterns.ts`): 30 MCQs, one 60-minute timer, free movement, +3 / −1, result and full solutions as
soon as the test ends (no untimed phase). A paper is a JSON file loaded by `scripts/surprise/push-paper.mjs`.

**The repo is public.** Paper files hold the answer key: keep them in `X:/ISHU BABY/EXAM-SYSTEM/.surprise-papers/`
(git-excluded), never in a commit, PR or artifact.

## 1. Pick the title

```
node scripts/surprise/push-paper.mjs --list --db live
```

Next title is `Surprise Test <n+1>`. Never reuse a question that an earlier surprise paper used (the script refuses repeats).

## 2. Plan the mix (30 questions)

Default blueprint; vary it a little each time so it stays a surprise:

| Subject (`section`) | Count | Notes |
|---|---|---|
| Quantitative Aptitude | 8 | arithmetic, algebra, geometry, numbers, modern maths |
| Verbal Ability | 7 | short RC (passage in the question), para-jumble as MCQ, grammar, vocabulary, critical reasoning |
| Logical Reasoning | 6 | arrangements, syllogisms, coding, series, blood relations, puzzles |
| Data Interpretation | 5 | each question carries its own small table/chart as a Markdown table |
| General Awareness | 4 | static business/economy/polity facts; current affairs only if verified from 2+ reliable sources |

- `style`: every one of CAT, CMAT, SNAP, NMAT, roughly even (about 7–8 each). Match the style: CAT = longer, multi-step; CMAT = includes GA; SNAP = quick, 4 options; NMAT = quick, may use 5 options (A–E).
- `difficulty`: about 9 Easy, 13 Medium, 8 Hard.
- Spread answer keys across A–D (E only on NMAT 5-option questions).

## 3. Find and write the questions

- Search the web for each exam's recent question types and topics (official sample papers, previous papers, forums) and for GA facts. Questions may be adapted from public sources, but **rewrite them** (new numbers, names, wording) — never paste coaching-site text verbatim. Original questions are fine and preferred. Record `source` (URL you adapted from, or `"original"`).
- Every question must stand alone: a DI or RC question repeats its table/passage in its own text.
- Markdown and KaTeX work in question, options and solution (`$x^2$`, tables). In JSON, backslashes must be escaped (`"\\frac{a}{b}"`).
- `solution`: full worked method a student can follow, ending with `Answer: X`.

## 4. Verify every answer (accuracy is the user's top priority)

1. Solve each question yourself from scratch and check the key, options (exactly one correct, no duplicates) and solution agree.
2. Give the paper **without keys or solutions** to a fresh subagent to solve independently; compare. Fix or replace any question where you disagree, where two options could be right, or where a GA fact is not confirmed.
3. `node scripts/surprise/push-paper.mjs .surprise-papers/<file>.json --check` must pass (count, mix, options, key named in solution, control characters).

## 5. Push

From the repo root (the env files with the database URLs live in the main checkout):

```
node scripts/surprise/push-paper.mjs ../EXAM-SYSTEM/.surprise-papers/<file>.json --db test --publish
node scripts/surprise/push-paper.mjs ../EXAM-SYSTEM/.surprise-papers/<file>.json --db live --publish
```

- Test first (Neon branch exam-engine-test; local dev reads `.env.development.local`). Optional: open `/surprise` on the local dev server as the test student and take it.
- Live loads only insert a new paper, so no backup is needed. The script reads back the stored keys.
- `--replace` swaps a paper with the same title only if nobody has attempted it yet. To pull a live paper, an admin can hide it in Admin → Papers.

## 6. Closing an old paper

If the user wants an earlier paper retired (often when a new one goes out):

```
node scripts/surprise/push-paper.mjs --close "Surprise Test 1" --db live --delete-after 24h
```

Closed papers take no new attempts (a test already running may finish), show "Closed · View solutions" in the tab,
and their solutions open to every student at `/papers/<id>/solutions`. With `--delete-after`, the paper and all its
attempts are deleted automatically at that time (`src/server/paper-expiry.ts`; runs within about a minute). Back up the
paper's attempts first if anyone has taken it (`.db-backups/`), since the deletion cannot be undone.

## 7. Report

Tell the user the title, the mix (subjects, styles, difficulties), any questions you dropped or changed during verification, and that it is live at `/surprise` on isha-s-exam.vercel.app.
