import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-12 max-w-md w-full text-center shadow-xs">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-black text-gray-400">
          404
        </div>
        <h1 className="text-2xl font-black text-gray-950 mb-2">Page or Paper Not Found</h1>
        <p className="text-sm text-gray-500 mb-8">
          The requested paper or resource does not exist or may have been removed.
        </p>
        <Link
          href="/exams"
          className="inline-block bg-gray-950 text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-gray-800 transition-colors shadow-sm"
        >
          &larr; Return to Examinations
        </Link>
      </div>
    </div>
  );
}
