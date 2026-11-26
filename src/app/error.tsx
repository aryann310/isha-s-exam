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
      <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-10 max-w-md w-full text-center">
        <h1 className="font-heading text-3xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-600 mb-4">
          An unexpected error occurred while rendering this page.
        </p>
        <div className="bg-red-50 text-red-800 text-xs p-3 rounded-lg mb-6 text-left overflow-auto font-mono">
          {error.message || "Unknown error"}
          {error.digest && <div className="mt-1 text-red-700">Digest: {error.digest}</div>}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="bg-gray-900 text-white font-semibold px-6 h-11 rounded-lg text-sm hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/exams"
            className="inline-flex items-center bg-white border border-gray-300 text-gray-900 font-semibold px-6 h-11 rounded-lg text-sm hover:bg-gray-100 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
