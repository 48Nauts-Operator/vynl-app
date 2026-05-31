import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "music-metadata"],
  allowedDevOrigins: ["192.168.74.179"],
  images: {
    // Bypass the Next.js image optimizer globally. Vynl is self-hosted;
    // there's no CDN gain to lose. The optimizer was returning 400 on
    // /api/covers/* URLs after the v0.6.33 path migration, breaking every
    // page that hadn't been migrated to the CoverArt component. With this
    // flag, <Image> renders a plain <img> pointing at the original src,
    // which works for /api/covers/, /api/artist-images/, legacy /covers/,
    // and every remote URL listed below without further config.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "mosaic.scdn.co" },
    ],
  },
};

export default nextConfig;
