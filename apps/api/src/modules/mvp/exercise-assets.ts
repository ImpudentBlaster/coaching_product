import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';

export const repositoryRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
export function exerciseImagesDirectory(): string {
  return resolve(repositoryRoot, process.env.EXERCISE_IMAGES_DIR || 'exercise_images');
}

export function exerciseGifFilename(id:string):string{
  if(!/^[0-9A-Za-z_-]+$/.test(id))throw new Error('UNSAFE_EXERCISE_ID');
  return `${id}.gif`;
}

export function isGifSignature(bytes:Uint8Array):boolean{
  const signature=Buffer.from(bytes.subarray(0,6)).toString('ascii');
  return signature==='GIF87a'||signature==='GIF89a';
}

export async function normalizeExerciseGif(bytes: Buffer): Promise<Buffer> {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024 || !isGifSignature(bytes)) throw new Error('Choose a valid GIF up to 8 MB.');
  try {
    const image = sharp(bytes, { animated: true, limitInputPixels: 30_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== 'gif' || (metadata.pages ?? 1) > 200) throw new Error('Invalid GIF');
    const result = await image.resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).gif().toBuffer();
    if (result.length > 8 * 1024 * 1024) throw new Error('GIF too large');
    return result;
  } catch { throw new Error('Use a valid GIF with at most 200 frames and 30 megapixels across all frames.'); }
}
