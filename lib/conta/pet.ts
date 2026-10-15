export const PORTES_PET = [
  ["mini", "Mini", "até 5 kg"],
  ["pequeno", "Pequeno", "5 a 10 kg"],
  ["medio", "Médio", "10 a 25 kg"],
  ["grande", "Grande", "25 a 45 kg"],
  ["gigante", "Gigante", "mais de 45 kg"],
] as const;

export const PELAGENS_PET = [
  ["curta", "Curta"],
  ["media", "Média"],
  ["longa", "Longa"],
] as const;

export type Pet = {
  id: string;
  nome: string;
  especie: string;
  raca: string | null;
  porte: (typeof PORTES_PET)[number][0];
  pelagem: (typeof PELAGENS_PET)[number][0];
  nascimento: string | null;
  alergias: string | null;
  temperamento: string | null;
  vacinas: string | null;
  foto_url: string | null;
};

export const ESPECIES_PET = [
  ["cao", "Cachorro"],
  ["gato", "Gato"],
] as const;

export const nomeEspecie = (especie: string) => (especie === "gato" ? "Gato" : "Cachorro");

type Sugestao = readonly [Pet["porte"], Pet["pelagem"]];

/**
 * Raças comuns por espécie, com o porte e a pelagem mais frequentes, só para sugerir no cadastro (o tutor confirma).
 * Ordem: SRD primeiro, depois o que mais aparece nos petshops. Quem não acha a raça escolhe "Outra" e digita.
 */
export const RACAS: Record<"cao" | "gato", Record<string, Sugestao>> = {
  cao: {
    SRD: ["medio", "curta"],
    "Shih Tzu": ["pequeno", "longa"],
    "Yorkshire Terrier": ["mini", "longa"],
    "Lhasa Apso": ["pequeno", "longa"],
    Poodle: ["pequeno", "media"],
    "Spitz Alemão (Lulu da Pomerânia)": ["mini", "longa"],
    Maltês: ["mini", "longa"],
    Pinscher: ["mini", "curta"],
    Chihuahua: ["mini", "curta"],
    "Bulldog Francês": ["pequeno", "curta"],
    "Bulldog Inglês": ["medio", "curta"],
    Pug: ["pequeno", "curta"],
    Dachshund: ["pequeno", "curta"],
    Beagle: ["medio", "curta"],
    Schnauzer: ["pequeno", "media"],
    "Bichon Frisé": ["pequeno", "longa"],
    "Cavalier King Charles": ["pequeno", "longa"],
    "West Highland Terrier": ["pequeno", "media"],
    "Jack Russell Terrier": ["pequeno", "curta"],
    "Cocker Spaniel": ["medio", "longa"],
    "Border Collie": ["medio", "media"],
    "Pit Bull": ["medio", "curta"],
    Boxer: ["grande", "curta"],
    "Golden Retriever": ["grande", "longa"],
    Labrador: ["grande", "curta"],
    "Pastor Alemão": ["grande", "media"],
    "Husky Siberiano": ["grande", "media"],
    Akita: ["grande", "media"],
    Rottweiler: ["grande", "curta"],
    "Chow Chow": ["grande", "longa"],
    Dálmata: ["grande", "curta"],
    "São Bernardo": ["gigante", "longa"],
    "Dogue Alemão": ["gigante", "curta"],
  },
  gato: {
    SRD: ["pequeno", "curta"],
    Persa: ["pequeno", "longa"],
    Siamês: ["pequeno", "curta"],
    "Maine Coon": ["medio", "longa"],
    Angorá: ["pequeno", "longa"],
    Ragdoll: ["medio", "longa"],
    "British Shorthair": ["pequeno", "curta"],
    Bengal: ["pequeno", "curta"],
    Sphynx: ["pequeno", "curta"],
    Himalaio: ["pequeno", "longa"],
  },
};
