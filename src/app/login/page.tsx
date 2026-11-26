import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    if (session.role === "ADMIN") {
      redirect("/admin");
    }
    redirect("/exams");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl border border-gray-200">
        <div className="text-center">
          <span className="w-11 h-11 rounded-xl bg-gray-900 text-white inline-flex items-center justify-center font-bold">M</span>
          <h1 className="font-heading text-3xl font-semibold text-gray-900 mt-4">Mock Test Portal</h1>
          <p className="text-sm text-gray-600 mt-1">Sign in with the account you were given.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
