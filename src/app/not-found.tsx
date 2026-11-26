import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-10 max-w-md w-full text-center">
        <p className="text-sm font-semibold text-gray-600 mb-2">404</p>
        <h1 className="font-heading text-3xl font-semibold text-gray-900 mb-2">Page not found</h1>
        <p className="text-sm text-gray-600 mb-8">
          The requested paper or resource does not exist or may have been removed.
        </p>
        <Link
          href="/exams"
          className="inline-flex items-center bg-gray-900 text-white font-semibold px-6 h-11 rounded-lg text-sm hover:bg-gray-800 transition-colors"
        >
          &larr; Back to exams
        </Link>
      </div>
    </div>
  );
}
