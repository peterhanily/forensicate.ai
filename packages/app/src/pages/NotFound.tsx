import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-20 text-center">
      <p className="font-mono text-sm text-gray-500">404</p>
      <h1 className="mt-3 text-3xl font-semibold text-gray-100">Page not found</h1>
      <p className="mt-4 text-gray-400">This address does not match a page on Forensicate.ai. Check the link or return to the scanner.</p>
      <div className="mt-8 flex justify-center gap-6">
        <Link to="/scanner" className="text-[#c9a227] underline underline-offset-4">Open scanner</Link>
        <Link to="/" className="text-gray-300 underline underline-offset-4">Go home</Link>
      </div>
    </section>
  );
}
