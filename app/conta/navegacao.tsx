"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Ícones de traço simples, na cor do texto do item.
const icone = (caminho: ReactNode) => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-6 sm:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {caminho}
  </svg>
);

const ITENS = [
  {
    href: "/conta/agendamentos",
    curto: "Agenda",
    longo: "Agendamentos",
    icone: icone(
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>,
    ),
  },
  {
    href: "/conta/pets",
    curto: "Pets",
    longo: "Meus pets",
    icone: icone(
      <>
        <circle cx="7" cy="9" r="1.8" />
        <circle cx="11" cy="6" r="1.8" />
        <circle cx="15.5" cy="7" r="1.8" />
        <circle cx="18" cy="11" r="1.6" />
        <path d="M8.5 15.5c0-2.2 1.8-4 4-4s4.5 2.3 4.5 4.5c0 1.8-1.3 3-3 3-1 0-1.5-.5-2.5-.5s-1.5.5-2.5.5c-1.4 0-2.5-1.2-2.5-2.5z" />
      </>,
    ),
  },
  {
    href: "/conta/lojas",
    curto: "Lojas",
    longo: "Minhas lojas",
    icone: icone(
      <>
        <path d="M4 9.5 5.5 4.5h13L20 9.5" />
        <path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5" />
        <path d="M5.5 12v7.5h13V12M10 19.5v-4h4v4" />
      </>,
    ),
  },
  {
    href: "/conta/perfil",
    curto: "Conta",
    longo: "Seus dados",
    icone: icone(
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
      </>,
    ),
  },
];

/**
 * No celular, barra fixa embaixo (ao alcance do polegar); do tablet para cima, abas no topo.
 * O rótulo curto aparece só no celular e o longo só nas abas, então o nome acessível é sempre um só.
 */
export function NavegacaoConta() {
  const atual = usePathname();
  if (atual.startsWith("/conta/entrar")) return null;
  return (
    <nav
      aria-label="Minha conta"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:pb-0 sm:backdrop-blur-none dark:border-neutral-800 dark:bg-neutral-950/95 sm:dark:bg-transparent"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4 sm:flex sm:gap-1 sm:pb-2">
        {ITENS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={atual.startsWith(item.href) ? "page" : undefined}
              className="group flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium text-neutral-500 aria-[current=page]:text-marca-700 sm:min-h-10 sm:flex-row sm:rounded-full sm:px-3 sm:text-sm sm:font-normal sm:text-neutral-600 sm:hover:bg-neutral-100 sm:aria-[current=page]:bg-marca-700 sm:aria-[current=page]:text-white dark:text-neutral-400 dark:aria-[current=page]:text-marca-400 sm:dark:text-neutral-300 sm:dark:hover:bg-neutral-900 sm:dark:aria-[current=page]:text-white"
            >
              <span className="flex h-8 w-14 items-center justify-center rounded-full group-aria-[current=page]:bg-marca-50 sm:hidden dark:group-aria-[current=page]:bg-marca-950">
                {item.icone}
              </span>
              <span className="sm:hidden">{item.curto}</span>
              <span className="hidden whitespace-nowrap sm:inline">{item.longo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
