import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createStudentAction, deleteStudentAction } from "@/server/actions/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { attempts: true } },
    },
  });

  return (
    <div>

      <div className="w-full">
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Authorized Members</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage student access to the private mock test platform.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Add Student Form */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs h-fit">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Add Authorized Student</h3>
            <p className="text-xs text-slate-500 mb-4">
              Create student credentials for private portal access.
            </p>

            <form action={createStudentAction} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">Full Name</label>
                <input
                  name="name"
                  placeholder="e.g. Aryan Sharma"
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Email Address</label>
                <input
                  name="email"
                  type="email"
                  placeholder="student@example.com"
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Password</label>
                <input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 text-white font-bold py-3 rounded-lg hover:bg-slate-800 transition-colors text-sm shadow-sm"
              >
                + Add Authorized Student
              </button>
            </form>
          </div>

          {/* Users List */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Registered Accounts ({users.length})
            </h3>

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Name</th>
                    <th className="px-6 py-3.5">Email</th>
                    <th className="px-6 py-3.5">Role</th>
                    <th className="px-6 py-3.5">Exam Attempts</th>
                    <th className="px-6 py-3.5">Joined</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-slate-900">{u.name}</td>
                      <td className="px-6 py-3.5 text-slate-600 font-mono">{u.email}</td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                            u.role === "ADMIN"
                              ? "bg-slate-900 text-white"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-slate-700">
                        {u._count.attempts} attempts
                      </td>
                      <td suppressHydrationWarning className="px-6 py-3.5 text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString("en-US")}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {u.role !== "ADMIN" && (
                          <form
                            action={async () => {
                              "use server";
                              await deleteStudentAction(u.id);
                            }}
                          >
                            <button
                              type="submit"
                              className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                            >
                              Revoke Access
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
