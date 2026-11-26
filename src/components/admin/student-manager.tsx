"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { createStudentAction, deleteStudentAction, setStudentActiveAction, type StudentFormState } from "@/server/actions/admin";
import { Badge, Card, btnCls, tableCls } from "@/components/admin/ui";

export interface StudentRow {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: string;
  isActive: boolean;
  attempts: number;
  joined: string;
}

const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";

export function StudentManager({ users }: { users: StudentRow[] }) {
  const [state, formAction, adding] = useActionState<StudentFormState, FormData>(createStudentAction, {});
  const [formKey, setFormKey] = useState(0);
  const [lastOk, setLastOk] = useState<StudentFormState | null>(null);
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StudentRow | null>(null);

  // Clear the form after a successful add (new key = fresh inputs).
  if (state.ok && state !== lastOk) {
    setLastOk(state);
    setFormKey((k) => k + 1);
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      try {
        const res = await fn();
        setNotice(res.ok ? { tone: "ok", text: okText } : { tone: "err", text: res.error ?? "That didn't work." });
      } catch {
        setNotice({ tone: "err", text: "That didn't work. Please try again." });
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Add a student" description="They can sign in with the username or the email address." className="h-fit">
        <form key={formKey} action={formAction} className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-slate-700">Full name</span>
            <input name="name" required maxLength={80} placeholder="e.g. Aryan Sharma" className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-slate-700">Email</span>
            <input name="email" type="email" required placeholder="student@example.com" className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-slate-700">Username <span className="text-slate-400">(optional — defaults to the part of the email before @)</span></span>
            <input name="username" pattern="[A-Za-z0-9._\-]{3,32}" placeholder="e.g. aryan.sharma" className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-slate-700">Password <span className="text-slate-400">(at least 8 characters)</span></span>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className={field} />
          </label>
          {state.error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{state.error}</p>}
          {state.ok && state.message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{state.message}</p>}
          <button type="submit" disabled={adding} className={`${btnCls.primary} w-full justify-center`}>
            {adding ? "Adding…" : "Add student"}
          </button>
        </form>
      </Card>

      <div className="space-y-3 lg:col-span-2">
        {notice && (
          <p className={`rounded-lg border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
            {notice.text}
          </p>
        )}
        <Card title={`Accounts (${users.length})`} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead className={tableCls.thead}>
                <tr>
                  <th className={tableCls.th}>Name</th>
                  <th className={tableCls.th}>Sign-in</th>
                  <th className={tableCls.th}>Role</th>
                  <th className={`${tableCls.th} text-right`}>Attempts</th>
                  <th className={tableCls.th}>Joined</th>
                  <th className={`${tableCls.th} text-right`} />
                </tr>
              </thead>
              <tbody className={tableCls.tbody}>
                {users.map((u) => (
                  <tr key={u.id} className={tableCls.tr}>
                    <td className={tableCls.td}>
                      <p className="font-medium text-slate-900">{u.name}</p>
                      {!u.isActive && <Badge tone="red">Access revoked</Badge>}
                    </td>
                    <td className={`${tableCls.td} text-xs`}>
                      <p className="text-slate-800">{u.username ?? <span className="text-slate-400">no username</span>}</p>
                      <p className="text-slate-500">{u.email}</p>
                    </td>
                    <td className={tableCls.td}>{u.role === "ADMIN" ? <Badge>Admin</Badge> : <Badge tone="blue">Student</Badge>}</td>
                    <td className={`${tableCls.td} text-right tabular-nums`}>{u.attempts}</td>
                    <td className={`${tableCls.td} whitespace-nowrap text-slate-500`}>{u.joined}</td>
                    <td className={`${tableCls.td} whitespace-nowrap text-right`}>
                      {u.role === "STUDENT" && (
                        <div className="inline-flex gap-1">
                          <Link href={`/analytics?student=${u.id}`} className={btnCls.ghost}>
                            Analytics
                          </Link>
                          {u.isActive ? (
                            <button type="button" disabled={busy} className={btnCls.ghost} onClick={() => run(() => setStudentActiveAction(u.id, false), `${u.name} can no longer sign in. Their history is kept.`)}>
                              Revoke access
                            </button>
                          ) : (
                            <button type="button" disabled={busy} className={btnCls.ghost} onClick={() => run(() => setStudentActiveAction(u.id, true), `${u.name} can sign in again.`)}>
                              Restore access
                            </button>
                          )}
                          <button type="button" disabled={busy} className={`${btnCls.ghost} text-rose-600`} onClick={() => setConfirmDelete(u)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Cancel" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-900">Delete {confirmDelete.name}?</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              The account and all {confirmDelete.attempts} of their test attempts are removed permanently. This can&apos;t be undone. To only stop them signing in, use Revoke access instead.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnCls.secondary} onClick={() => setConfirmDelete(null)} autoFocus>Cancel</button>
              <button
                type="button"
                className={btnCls.danger}
                onClick={() => {
                  const u = confirmDelete;
                  setConfirmDelete(null);
                  run(() => deleteStudentAction(u.id), `${u.name} and their attempts were deleted.`);
                }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
