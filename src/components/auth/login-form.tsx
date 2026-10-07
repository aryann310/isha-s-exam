"use client";

import { useState } from "react";
import { loginAction } from "@/server/actions/auth";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await loginAction(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else if (result?.success) {
      if (result.role === "ADMIN") {
        router.push("/admin");
      } else {
        router.push("/exams");
      }
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-700" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
          placeholder="e.g. Aryansinh or ishubaby"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-700" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
          placeholder="••••••••"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center justify-center rounded-lg text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-800 h-11 w-full shadow-sm mt-2"
      >
        {loading ? "Verifying Credentials..." : "SIGN IN"}
      </button>
    </form>
  );
}
