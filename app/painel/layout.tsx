import Link from "next/link";
import { sair } from "@/app/entrar/acoes";

export default function PainelLayout({ children }: LayoutProps<"/painel">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/painel" className="font-semibold text-teal-700 dark:text-teal-400">
            Hora do Pet <span className="font-normal text-neutral-500">· Painel</span>
          </Link>
          <form action={sair}>
            <button type="submit" className="min-h-11 px-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400">
              Sair
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
