import type { Area } from 'react-easy-crop';

/** Side of the square avatar that is uploaded — sharp on retina, ~100 KB as JPEG. */
export const AVATAR_OUTPUT_SIZE = 512;
/** Width of an uploaded logo. Logos are square, like avatars. */
export const LOGO_OUTPUT_SIZE = 512;
/** Width of an uploaded banner; the height follows the crop's aspect. */
export const BANNER_OUTPUT_WIDTH = 1600;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_UNREADABLE'));
    img.src = src;
  });
}

// Longest side of the image the editor works on. Phone photos are 4000px+;
// rotating one on a canvas would pass the ~16 MP limit of iOS Safari, and the
// sizes above gain nothing from more detail than this.
const WORKING_MAX_SIDE = 2048;

/**
 * Decodes the chosen file and returns an object URL of a copy no larger than
 * WORKING_MAX_SIDE. The caller revokes it. Rejects with IMAGE_UNREADABLE when
 * the browser cannot decode the file (e.g. HEIC on desktop Chrome).
 */
export async function prepareSourceImage(file: File): Promise<string> {
  const originalUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(originalUrl);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) throw new Error('IMAGE_UNREADABLE');
    if (longest <= WORKING_MAX_SIDE) {
      return originalUrl;
    }
    const scale = WORKING_MAX_SIDE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    URL.revokeObjectURL(originalUrl);
    if (!blob) throw new Error('IMAGE_UNREADABLE');
    return URL.createObjectURL(blob);
  } catch (err) {
    URL.revokeObjectURL(originalUrl);
    throw err;
  }
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Size of the box that holds a width×height rectangle rotated by `rotation` degrees. */
function rotatedBounds(width: number, height: number, rotation: number) {
  const rad = toRadians(rotation);
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/**
 * Renders the area chosen in the cropper (pixel coordinates of the rotated
 * image, as react-easy-crop reports them) into a canvas of `outputWidth` by
 * `outputHeight` — the same for a square avatar, different for a wide banner.
 */
export async function renderCrop(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  outputWidth: number,
  outputHeight: number = outputWidth,
): Promise<HTMLCanvasElement> {
  const image = await loadImage(imageSrc);

  // 1. Draw the whole image rotated around its centre.
  const bounds = rotatedBounds(image.naturalWidth, image.naturalHeight, rotation);
  const rotated = document.createElement('canvas');
  rotated.width = Math.round(bounds.width);
  rotated.height = Math.round(bounds.height);
  const rctx = rotated.getContext('2d');
  if (!rctx) throw new Error('CANVAS_UNAVAILABLE');
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate(toRadians(rotation));
  rctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
  rctx.drawImage(image, 0, 0);

  // 2. Cut the chosen area out of it, scaled to the output size. A white
  // background keeps transparent PNGs from turning black once saved as JPEG.
  const out = document.createElement('canvas');
  out.width = outputWidth;
  out.height = outputHeight;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outputWidth, outputHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    rotated,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outputWidth, outputHeight,
  );

  // Release the (possibly very large) intermediate bitmap right away.
  rotated.width = 0;
  rotated.height = 0;
  return out;
}

export function canvasToFile(canvas: HTMLCanvasElement, filename = 'image.jpg'): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('ENCODE_FAILED')); return; }
        resolve(new File([blob], filename, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  });
}
