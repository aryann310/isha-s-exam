"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error Caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-12 max-w-md w-full text-center shadow-xs">
        <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-black text-rose-600">
          ⚠
        </div>
        <h1 className="text-2xl font-black text-gray-950 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-6">
          An unexpected error occurred while rendering this page.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="bg-gray-950 text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-gray-800 transition-colors shadow-sm"
          >
            Try Again
          </button>
          <Link
            href="/exams"
            className="bg-white border border-gray-300 text-gray-900 font-bold px-6 py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
