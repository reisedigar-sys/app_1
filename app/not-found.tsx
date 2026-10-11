import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-12">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-neutral-500">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/painel" className="text-sm font-medium text-teal-700 dark:text-teal-400">
        Voltar ao painel
      </Link>
    </main>
  );
}
