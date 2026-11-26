import { redirect } from "next/navigation";
import { getSession, deleteSession } from "@/lib/auth/session";
import { countLive } from "@/server/admin-data";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const liveCount = await countLive();

  async function logout() {
    "use server";
    await deleteSession();
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#f3f3ef] text-slate-900 lg:flex">
      <AdminSidebar adminName={(session.username as string) || (session.name as string) || "Admin"} liveCount={liveCount} logout={logout} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
