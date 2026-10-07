import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    if (session.role === "ADMIN") {
      redirect("/admin");
    }
    redirect("/exams");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-sm border border-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">MOCK TEST PORTAL</h1>
          <p className="text-sm text-gray-500 mt-2">Private Access Only</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
