// Multi-provider cover art lookup.
//
// iTunes' public API throttles aggressively (HTTP 429) and used to be
// our only source. This module chains three free, key-less providers
// and returns the first hit:
//
//   1. MusicBrainz Cover Art Archive (CAA) — official, fed by the MB
//      community. Requires an MBID, so we do a MusicBrainz release
//      search first if we don't have one.
//   2. Deezer — public search endpoint, no auth, generous rate limit
//      (~50/sec per IP). Returns cover_xl URLs.
//   3. iTunes — kept as the last fallback for the long tail (older
//      albums where CAA + Deezer come up empty), and skipped silently
//      when iTunes 429s.

export interface CoverHit {
  name: string;
  artist: string;
  /** Hi-res URL (~600px+). */
  artworkUrl: string;
  /** Smaller thumbnail for the picker grid (~100px). */
  artworkUrlSmall: string;
  source: "caa" | "deezer" | "itunes";
}

const UA = "Vynl/0.6.x (cover-art lookup)";

/** Search MusicBrainz releases by free-text query, return the top N IDs. */
async function searchMbReleases(query: string, limit = 5): Promise<Array<{
  id: string;
  title: string;
  artist: string;
}>> {
  const url = `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return [];
  const data = await res.json();
  type Release = {
    id: string;
    title: string;
    "artist-credit"?: Array<{ name: string }>;
  };
  return (data.releases || []).map((r: Release) => ({
    id: r.id,
    title: r.title,
    artist: (r["artist-credit"] || []).map((a) => a.name).join(", "),
  }));
}

/** HEAD the CAA URL; CAA returns 404 (not 200) when no front art exists. */
async function caaHasFront(mbid: string): Promise<boolean> {
  try {
    const res = await fetch(`https://coverartarchive.org/release/${mbid}/front`, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function searchCAA(query: string): Promise<CoverHit[]> {
  const releases = await searchMbReleases(query, 6);
  const hits: CoverHit[] = [];
  // CAA HEADs in parallel; keep only the ones that actually have art.
  const checks = await Promise.all(
    releases.map(async (r) => ({ r, has: await caaHasFront(r.id) }))
  );
  for (const { r, has } of checks) {
    if (!has) continue;
    hits.push({
      name: r.title,
      artist: r.artist,
      artworkUrl: `https://coverartarchive.org/release/${r.id}/front`,
      artworkUrlSmall: `https://coverartarchive.org/release/${r.id}/front-250`,
      source: "caa",
    });
  }
  return hits;
}

async function searchDeezer(query: string): Promise<CoverHit[]> {
  try {
    const url = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=8`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const data = await res.json();
    type DeezerAlbum = {
      title: string;
      artist?: { name: string };
      cover_big?: string;
      cover_medium?: string;
      cover_xl?: string;
    };
    return ((data.data || []) as DeezerAlbum[])
      .filter((a) => a.cover_xl || a.cover_big)
      .map((a) => ({
        name: a.title,
        artist: a.artist?.name || "",
        artworkUrl: a.cover_xl || a.cover_big || "",
        artworkUrlSmall: a.cover_medium || a.cover_big || "",
        source: "deezer" as const,
      }));
  } catch {
    return [];
  }
}

async function searchITunes(query: string): Promise<CoverHit[]> {
  try {
    const url = `https://itunes.apple.com/search?${new URLSearchParams({
      term: query,
      entity: "album",
      limit: "8",
    })}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      // 429 / 5xx — swallow and move on. We prefer no results to a
      // hard failure when other providers might still have hits.
      return [];
    }
    const data = await res.json();
    type ITunesItem = {
      collectionName: string;
      artistName: string;
      artworkUrl100?: string;
    };
    return ((data.results || []) as ITunesItem[])
      .filter((r) => r.artworkUrl100)
      .map((r) => ({
        name: r.collectionName,
        artist: r.artistName,
        artworkUrl: r.artworkUrl100!.replace("100x100", "600x600"),
        artworkUrlSmall: r.artworkUrl100!,
        source: "itunes" as const,
      }));
  } catch {
    return [];
  }
}

/**
 * Multi-provider search. Runs all three providers in parallel and
 * stitches results together preserving order (CAA → Deezer → iTunes).
 * De-duplicates by `${artist}::${name}` so identical hits across
 * providers collapse to one row in the UI.
 */
export async function searchCoverArt(query: string): Promise<CoverHit[]> {
  const [caa, deezer, itunes] = await Promise.all([
    searchCAA(query),
    searchDeezer(query),
    searchITunes(query),
  ]);
  const all = [...caa, ...deezer, ...itunes];
  const seen = new Set<string>();
  const deduped: CoverHit[] = [];
  for (const h of all) {
    const key = `${h.artist.toLowerCase()}::${h.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(h);
  }
  return deduped;
}
