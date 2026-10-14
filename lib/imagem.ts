// Fotos tiradas no celular passam fácil de 2 MB (limite do bucket `fotos`). Antes de enviar, a foto é reduzida no
// próprio navegador para JPEG com no máximo `ladoMaximo` pixels no lado maior.

/** Reduz a foto para JPEG; null se o navegador não conseguir ler a imagem. Só roda no navegador. */
export async function reduzirFoto(arquivo: File, ladoMaximo = 1080): Promise<Blob | null> {
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const escala = Math.min(1, ladoMaximo / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff"; // PNG com transparência vira fundo branco no JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close();
  return new Promise((ok) => canvas.toBlob((b) => ok(b), "image/jpeg", 0.85));
}
