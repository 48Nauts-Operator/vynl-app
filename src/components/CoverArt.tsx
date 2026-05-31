"use client";

/**
 * CoverArt — single fallback for any image slot that may not have artwork yet.
 *
 * Renders the cover when present + loadable. Falls back to the Vynl Dragon DJ
 * logo (public/logo-main.png) in two cases:
 *   1. coverPath is null/empty
 *   2. coverPath is set but the image fails to load (404, network error,
 *      file removed from disk while DB still references it)
 *
 * Case 2 matters for local-dev environments where the DB has paths to
 * cover files that only exist on the production NAS, and for any
 * post-delete cleanup race where the file disappears before the row.
 *
 * Use this anywhere you would have done `coverPath ? <Image .../> : <Disc3 />`.
 */
import Image from "next/image";
import { useState, useEffect } from "react";

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
  const [errored, setErrored] = useState(false);
  // Reset error state when coverPath changes — a row re-render with a new
  // path should try the new image, not stay stuck on the dragon.
  useEffect(() => {
    setErrored(false);
  }, [coverPath]);

  const useFallback = !coverPath || errored;
  const src = useFallback ? "/logo-main.png" : (coverPath as string);
  const isFallback = useFallback;

  // Compose dim style for the fallback only — real covers always render at
  // full strength.
  const dimStyle =
    isFallback && dim
      ? "opacity-80 mix-blend-screen"
      : "";

  // Skip Next.js image optimization. Covers are already hash-named files
  // at fixed sizes; the optimizer's /_next/image proxy was returning 400 for
  // these same-origin API URLs and there's no resize/format gain to lose.
  const commonProps = {
    src,
    alt,
    onError: () => setErrored(true),
    unoptimized: true as const,
  };

  if (fill) {
    return (
      <Image
        {...commonProps}
        fill
        className={`object-cover ${dimStyle} ${className || ""}`.trim()}
        sizes="(max-width: 768px) 50vw, 25vw"
      />
    );
  }

  return (
    <Image
      {...commonProps}
      width={width || 224}
      height={height || 224}
      className={`object-cover ${dimStyle} ${className || ""}`.trim()}
    />
  );
}
