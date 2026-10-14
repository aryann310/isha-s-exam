import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createStudentAction, deleteStudentAction } from "@/server/actions/admin";

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
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
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
            <Link href="/admin/exams" className="hover:text-white transition-colors">
              Exams
            </Link>
            <Link href="/admin/papers" className="hover:text-white transition-colors">
              Papers
            </Link>
            <Link href="/admin/questions" className="hover:text-white transition-colors">
              Questions
            </Link>
            <Link href="/admin/import" className="hover:text-white transition-colors">
              Bulk Import
            </Link>
            <Link href="/admin/results" className="hover:text-white transition-colors">
              Student Results
            </Link>
            <Link href="/admin/users" className="text-white font-bold border-b-2 border-white pb-1">
              Users
            </Link>
          </nav>
        </div>
        <Link href="/admin" className="text-xs text-gray-400 hover:text-white">
          &larr; Back to Dashboard
        </Link>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Authorized Members</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage student access to the private mock test platform.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Add Student Form */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs h-fit">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Add Authorized Student</h3>
            <p className="text-xs text-gray-500 mb-4">
              Create student credentials for private portal access.
            </p>

            <form action={createStudentAction} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-gray-700 mb-1">Full Name</label>
                <input
                  name="name"
                  placeholder="e.g. Aryan Sharma"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Email Address</label>
                <input
                  name="email"
                  type="email"
                  placeholder="student@example.com"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Password</label>
                <input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors text-sm shadow-sm"
              >
                + Add Authorized Student
              </button>
            </form>
          </div>

          {/* Users List */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">
              Registered Accounts ({users.length})
            </h3>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 text-gray-700 uppercase font-bold border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3.5">Name</th>
                    <th className="px-6 py-3.5">Email</th>
                    <th className="px-6 py-3.5">Role</th>
                    <th className="px-6 py-3.5">Exam Attempts</th>
                    <th className="px-6 py-3.5">Joined</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-gray-900">{u.name}</td>
                      <td className="px-6 py-3.5 text-gray-600 font-mono">{u.email}</td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded font-black text-[10px] ${
                            u.role === "ADMIN"
                              ? "bg-gray-900 text-white"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-gray-700">
                        {u._count.attempts} attempts
                      </td>
                      <td suppressHydrationWarning className="px-6 py-3.5 text-gray-400">
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
      </main>
    </div>
  );
}
