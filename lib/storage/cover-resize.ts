import sharp from 'sharp';
import { COVER_SIZES, COVER_JPEG_QUALITY, type CoverSizeId } from './cover-image';

// Sharp is a native module. Keeping the resize step in its own tiny module means
// the pipeline's one non-portable dependency has a single import site and a real
// smoke test (backlog P4-03's acceptance criterion) that runs in CI on the same
// Node version the deploy target uses.

export interface CoverDerivative {
  size: CoverSizeId;
  width: number;
  height: number;
  body: Buffer;
}

export class CoverImageUnreadableError extends Error {}

/**
 * Resizes one source image into the fixed derivative ladder, all JPEG.
 *
 * `fit: 'cover'` crops to the exact 16:9 box rather than letterboxing, `rotate()`
 * applies EXIF orientation before metadata is dropped, and re-encoding strips all
 * EXIF — including any GPS coordinates the host's phone attached to the photo.
 */
export async function buildCoverDerivatives(source: Buffer): Promise<CoverDerivative[]> {
  try {
    return await Promise.all(
      COVER_SIZES.map(async (size) => ({
        size: size.id,
        width: size.width,
        height: size.height,
        body: await sharp(source, { failOn: 'error' })
          .rotate()
          .resize(size.width, size.height, { fit: 'cover', position: 'centre', withoutEnlargement: false })
          .jpeg({ quality: COVER_JPEG_QUALITY, mozjpeg: true })
          .toBuffer(),
      })),
    );
  } catch (e) {
    throw new CoverImageUnreadableError(e instanceof Error ? e.message : 'Unreadable image');
  }
}
