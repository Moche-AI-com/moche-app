'use client';

import Image from 'next/image';
import { useState } from 'react';

// Add-on (premium imagery) — a next/image wrapper that ALWAYS renders a tasteful dark
// gradient behind the photo, so the layout is perfect whether or not the local asset
// exists. If the file is missing (or fails to load) the image quietly drops and the
// gradient remains. No image is bundled — drop files at the documented public/ paths
// to light them up. `unoptimized` keeps this dependency-free (no loader/domain config).
export function PremiumImage({
  src,
  alt,
  aspectRatio = '16 / 9',
  gradient = 'radial-gradient(120% 120% at 50% 0%, rgba(201,169,110,.16), transparent 55%), linear-gradient(150deg, #191d27, #0d0f14)',
  radius = 16,
  priority = false,
  sizes = '100vw',
  className,
  children,
}: {
  src: string;
  alt: string;
  aspectRatio?: string;
  gradient?: string;
  radius?: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={className}
      style={{ position: 'relative', aspectRatio, borderRadius: radius, overflow: 'hidden', background: gradient }}
      data-testid="premium-image"
    >
      {!failed && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized
          onError={() => setFailed(true)}
          style={{ objectFit: 'cover' }}
        />
      )}
      {children}
    </div>
  );
}
