import Link from "next/link";
import { Suspense } from "react";
import { sairTutor } from "./acoes";
import { NavegacaoConta } from "./navegacao";

export default function ContaLayout({ children }: LayoutProps<"/conta">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50 dark:bg-black">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link href="/conta" className="font-semibold text-marca-700 dark:text-marca-400">
            Hora do Pet
          </Link>
          <form action={sairTutor}>
            <button type="submit" className="min-h-11 px-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400">
              Sair
            </button>
          </form>
        </div>
        <div className="mx-auto max-w-2xl px-4">
          <Suspense fallback={<div className="h-12" />}>
            <NavegacaoConta />
          </Suspense>
        </div>
      </header>
      {children}
    </div>
  );
}
