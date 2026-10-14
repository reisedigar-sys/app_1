import Link from "next/link";

const botao = "flex min-h-11 items-center justify-center rounded-md px-4 font-medium";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-3xl font-semibold text-marca-700 dark:text-marca-400">Hora do Pet</h1>
      <p className="text-lg">Banho e tosa agendados em poucos toques.</p>
      <nav aria-label="Acesso" className="mt-4 flex flex-col gap-3">
        <Link href="/conta" className={`${botao} bg-marca-700 text-white hover:bg-marca-800`}>
          Sou tutor: meus pets e agendamentos
        </Link>
        <Link
          href="/entrar"
          className={`${botao} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900`}
        >
          Sou petshop: entrar no painel
        </Link>
      </nav>
    </main>
  );
}
