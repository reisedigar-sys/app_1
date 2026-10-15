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

/**
 * Raças comuns com o porte e a pelagem mais frequentes, só para sugerir no cadastro (o tutor confirma).
 * Ordem: o que mais aparece nos petshops primeiro.
 */
export const RACAS_SUGERIDAS: Record<string, readonly [Pet["porte"], Pet["pelagem"]]> = {
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
  Pug: ["pequeno", "curta"],
  Dachshund: ["pequeno", "curta"],
  Beagle: ["medio", "curta"],
  Schnauzer: ["pequeno", "media"],
  "Cocker Spaniel": ["medio", "longa"],
  "Border Collie": ["medio", "media"],
  "Golden Retriever": ["grande", "longa"],
  Labrador: ["grande", "curta"],
  "Pastor Alemão": ["grande", "media"],
  "Husky Siberiano": ["grande", "media"],
  Rottweiler: ["grande", "curta"],
  "Chow Chow": ["grande", "longa"],
  "São Bernardo": ["gigante", "longa"],
  "Gato SRD": ["pequeno", "curta"],
  Persa: ["pequeno", "longa"],
  "Maine Coon": ["medio", "longa"],
};
