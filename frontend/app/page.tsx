import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <main className="flex flex-col items-center gap-8 text-center px-6">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-5xl font-bold tracking-tight text-white">Atlas</h1>
          <p className="text-zinc-400 text-lg max-w-sm">
            Agentic AI trading assistant with configurable execution authority
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="px-5 py-2.5 bg-white text-zinc-950 rounded-lg font-medium hover:bg-zinc-100 transition-colors"
          >
            Open Dashboard
          </Link>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 border border-zinc-700 text-zinc-300 rounded-lg font-medium hover:border-zinc-500 transition-colors"
          >
            API Docs
          </a>
        </div>

        <div className="flex gap-8 text-sm text-zinc-500">
          <span>Advisory</span>
          <span>·</span>
          <span>Conditional</span>
          <span>·</span>
          <span>Autonomous</span>
        </div>
      </main>
    </div>
  );
}
