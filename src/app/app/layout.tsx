import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { SettingsIcon } from "@/components/icons";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 aurora-glow opacity-40" />
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <BrandMark />
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/app"
              className="rounded-lg px-3 py-1.5 text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
            >
              Studio
            </Link>
            <Link
              href="/app/settings"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
            >
              <SettingsIcon className="h-4 w-4" />
              Settings
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
