// Gets picked files ready for upload so they fit the free storage plan:
//  - photos are shrunk in the browser (max 1920px on the long side, JPEG) when that makes them smaller
//  - anything over the plan's size limits is refused up front with a clear message,
//    instead of failing after a long upload

const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;
const MAX_OTHER = 10 * 1024 * 1024;
const MAX_SIDE = 1920;
const SKIP_BELOW = 400 * 1024; // already small: leave alone

const mb = (n) => `${Math.round(n / (1024 * 1024))} MB`;

async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < SKIP_BELOW) return file;
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // PNG transparency becomes white in the JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file; // only use it if it is actually smaller
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (err) {
    return file; // anything unexpected: upload the original
  }
}

// -> { files: File[] (accepted, photos shrunk), rejected: string[] (human-readable reasons) }
export async function prepareFiles(list) {
  const files = [];
  const rejected = [];
  for (const original of list) {
    const file = await shrinkImage(original);
    const type = file.type || '';
    let limit = MAX_OTHER;
    let label = 'documents';
    if (type.startsWith('image/')) { limit = MAX_PHOTO; label = 'photos'; }
    else if (type.startsWith('video/')) { limit = MAX_VIDEO; label = 'videos'; }
    if (file.size > limit) {
      rejected.push(`${original.name} is ${mb(file.size)}. The limit for ${label} is ${mb(limit)}.`);
    } else {
      files.push(file);
    }
  }
  return { files, rejected };
}
