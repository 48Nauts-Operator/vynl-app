"use client";

/**
 * CoverArt — single fallback for any image slot that may not have artwork yet.
 *
 * When coverPath is set, renders the Next.js Image. Otherwise renders the
 * Vynl Dragon DJ logo (public/logo-main.png) so the UI never shows an empty
 * disc / muted music icon. The logo is brand-on, looks intentional, and at
 * small sizes still reads as "this is an album with no cover yet."
 *
 * Use this anywhere you would have done `coverPath ? <Image .../> : <Disc3 />`.
 */
import Image from "next/image";

interface Props {
  coverPath: string | null | undefined;
  alt: string;
  /** Pixel width when used with explicit dimensions. Either pass both
   *  width+height OR set `fill` to true and let the parent constrain. */
  width?: number;
  height?: number;
  /** Use Next/Image fill mode. The parent MUST be position: relative with
   *  defined dimensions. */
  fill?: boolean;
  className?: string;
  /** When true, the dragon fallback gets a subtle grayscale + opacity so
   *  it doesn't fight with adjacent real covers in a grid. */
  dim?: boolean;
}

export function CoverArt({
  coverPath,
  alt,
  width,
  height,
  fill,
  className,
  dim,
}: Props) {
  const src = coverPath || "/logo-main.png";
  const isFallback = !coverPath;

  // Compose dim style for the fallback only — real covers always render at
  // full strength.
  const dimStyle =
    isFallback && dim
      ? "opacity-80 mix-blend-screen"
      : "";

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover ${dimStyle} ${className || ""}`.trim()}
        sizes="(max-width: 768px) 50vw, 25vw"
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width || 224}
      height={height || 224}
      className={`object-cover ${dimStyle} ${className || ""}`.trim()}
    />
  );
}
