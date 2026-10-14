"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  ["/conta/agendamentos", "Agendamentos"],
  ["/conta/lojas", "Minhas lojas"],
  ["/conta/pets", "Meus pets"],
  ["/conta/perfil", "Seus dados"],
] as const;

export function NavegacaoConta() {
  const atual = usePathname();
  if (atual.startsWith("/conta/entrar")) return null;
  return (
    <nav aria-label="Minha conta" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 pb-2">
        {ITENS.map(([href, rotulo]) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={atual.startsWith(href) ? "page" : undefined}
              className="flex min-h-10 items-center whitespace-nowrap rounded-full px-3 text-sm text-neutral-600 hover:bg-neutral-100 aria-[current=page]:bg-teal-700 aria-[current=page]:text-white dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              {rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
