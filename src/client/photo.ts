// Browser-side photo preparation for AI grading: check, decode (with fallback), resize to ≤1024px JPEG.
// Photos never leave the browser except in the grading request itself; nothing is stored.

export const MAX_PHOTO_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_SIDE = 1024;
export const JPEG_QUALITY = 0.8;
export const DECODE_ERROR = "Couldn't read this photo – please use JPG or PNG";

/** Error message, or null if the file may be decoded. Runs before any decoding. */
export function checkPhotoFile(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith("image/")) return "That file is not an image.";
  if (file.size > MAX_PHOTO_FILE_BYTES) return "Photo is larger than 10 MB – please pick a smaller one.";
  return null;
}

/** Scale to fit a max side, keeping the aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}
export interface PhotoDeps {
  decodeBitmap(file: Blob): Promise<DecodedImage>;
  decodeImg(file: Blob): Promise<DecodedImage>;
  encodeJpeg(img: DecodedImage, width: number, height: number): Promise<string>;
}

export type PreparedPhoto = { ok: true; base64: string } | { ok: false; message: string };

/** Check → decode (createImageBitmap, else <img>) → resize + JPEG. Never throws. */
export async function preparePhoto(file: File, deps: PhotoDeps = browserPhotoDeps): Promise<PreparedPhoto> {
  const problem = checkPhotoFile(file);
  if (problem) return { ok: false, message: problem };

  let img: DecodedImage;
  try {
    img = await deps.decodeBitmap(file);
  } catch {
    try {
      img = await deps.decodeImg(file); // e.g. imageOrientation unsupported, or older Safari
    } catch {
      return { ok: false, message: DECODE_ERROR }; // e.g. HEIC on desktop Chrome
    }
  }
  try {
    const { width, height } = fitWithin(img.width, img.height, MAX_PHOTO_SIDE);
    return { ok: true, base64: await deps.encodeJpeg(img, width, height) };
  } catch {
    return { ok: false, message: DECODE_ERROR };
  } finally {
    img.close?.();
  }
}

export const browserPhotoDeps: PhotoDeps = {
  async decodeBitmap(file) {
    if (typeof createImageBitmap !== "function") throw new Error("createImageBitmap unsupported");
    // from-image: respect EXIF orientation so phone photos are not sideways.
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  },
  async decodeImg(file) {
    const url = URL.createObjectURL(file);
    try {
      const el = new Image();
      el.src = url;
      await el.decode(); // <img> applies EXIF orientation by default in current browsers
      if (!el.naturalWidth || !el.naturalHeight) throw new Error("empty image");
      return { source: el, width: el.naturalWidth, height: el.naturalHeight };
    } finally {
      // Safe to revoke: once decoded, the element keeps its pixels for drawImage.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  },
  async encodeJpeg(img, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("encode failed");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  },
};
