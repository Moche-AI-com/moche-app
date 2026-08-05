import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { buildCoverDerivatives, CoverImageUnreadableError } from './cover-resize';
import { COVER_SIZES } from './cover-image';

// Backlog P4-03 acceptance: sharp is installed and actually resizes a sample
// image on this Node version. If the native binary is missing or ABI-mismatched
// on a deploy target, this fails in CI instead of failing on a host's first upload.

async function sample(width: number, height: number, format: 'png' | 'jpeg' | 'webp' = 'png') {
  const img = sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
  });
  return format === 'png' ? img.png().toBuffer() : format === 'webp' ? img.webp().toBuffer() : img.jpeg().toBuffer();
}

describe('buildCoverDerivatives', () => {
  it('produces one JPEG per configured size at exact dimensions', async () => {
    const derivatives = await buildCoverDerivatives(await sample(2400, 1600));

    expect(derivatives).toHaveLength(COVER_SIZES.length);

    for (const size of COVER_SIZES) {
      const d = derivatives.find((x) => x.size === size.id);
      expect(d, `missing derivative ${size.id}`).toBeDefined();
      const meta = await sharp(d!.body).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(size.width);
      expect(meta.height).toBe(size.height);
    }
  });

  it('crops rather than distorts a source with the wrong aspect ratio', async () => {
    // Tall portrait source into a 16:9 box: dimensions must still be exact.
    const derivatives = await buildCoverDerivatives(await sample(900, 1600));
    const hero = derivatives.find((d) => d.size === 'hero')!;
    const meta = await sharp(hero.body).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(900);
  });

  it('upscales a source smaller than the target rather than failing', async () => {
    const derivatives = await buildCoverDerivatives(await sample(320, 180));
    const hero = derivatives.find((d) => d.size === 'hero')!;
    const meta = await sharp(hero.body).metadata();
    expect(meta.width).toBe(1600);
  });

  it('accepts webp and jpeg sources, not just png', async () => {
    for (const format of ['jpeg', 'webp'] as const) {
      const derivatives = await buildCoverDerivatives(await sample(1200, 800, format));
      expect(derivatives).toHaveLength(COVER_SIZES.length);
    }
  });

  it('strips EXIF metadata from the output', async () => {
    // sharp can only author IFD0 tags, so Copyright stands in for the whole EXIF
    // block here. The guarantee under test is that the re-encode emits no EXIF at
    // all, which is what keeps a phone photo's GPS tags off the guest portal.
    const withExif = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'test-host' } } })
      .jpeg()
      .toBuffer();

    const [first] = await buildCoverDerivatives(withExif);
    const meta = await sharp(first.body).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it('rejects a non-image payload with a typed error', async () => {
    await expect(buildCoverDerivatives(Buffer.from('not an image at all'))).rejects.toBeInstanceOf(
      CoverImageUnreadableError,
    );
  });

  it('rejects a truncated image with a typed error', async () => {
    const full = await sample(1200, 800, 'jpeg');
    await expect(buildCoverDerivatives(full.subarray(0, 64))).rejects.toBeInstanceOf(CoverImageUnreadableError);
  });
});
