import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { artistIntel } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import fs from "fs";
import path from "path";

interface ChartHit {
  title: string;
  year: number | null;
  peak: number | null;
  weeks: number | null;
  chart: string;
  certification?: string | null;
}

interface Certification {
  title: string;
  type: string;
  count?: number;
  country?: string;
}

interface MusicBrainzArtist {
  id: string;
  name: string;
  type?: string;
  "life-span"?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  area?: { name: string };
  "begin-area"?: { name: string };
  tags?: Array<{ name: string; count: number }>;
}

const VYNL_USER_AGENT =
  process.env.VYNL_USER_AGENT || "Vynl/1.0 (https://github.com/vynl)";

const MB_BASE = "https://musicbrainz.org/ws/2";
const MB_HEADERS = {
  Accept: "application/json",
  "User-Agent": VYNL_USER_AGENT,
};

const WD_ENDPOINT = "https://query.wikidata.org/sparql";
const WD_HEADERS = {
  "User-Agent": VYNL_USER_AGENT,
  Accept: "application/sparql-results+json",
};

/** Normalize a song title for deduplication */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\s*\[.*?\]\s*/g, "")
    .replace(/[''""]/g, "'")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip HTML tags, entities, and references from a string */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&[^;]+;/g, " ")
    .replace(/\[\w+\]/g, "")
    .replace(/[‡†\*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ──────────────────────────────────────────────────────────────────
// MusicBrainz helpers
// ──────────────────────────────────────────────────────────────────

async function searchMusicBrainz(artistName: string): Promise<MusicBrainzArtist | null> {
  try {
    const url = `${MB_BASE}/artist/?query=artist:${encodeURIComponent(artistName)}&limit=1&fmt=json`;
    const res = await fetch(url, { headers: MB_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return data.artists?.[0] || null;
  } catch {
    return null;
  }
}

async function fetchMusicBrainzArtist(mbid: string): Promise<MusicBrainzArtist | null> {
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const url = `${MB_BASE}/artist/${mbid}?inc=tags+url-rels&fmt=json`;
    const res = await fetch(url, { headers: MB_HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// Wikipedia helpers
// ──────────────────────────────────────────────────────────────────

async function fetchWikipediaSummary(
  artistName: string
): Promise<{ summary: string; imageUrl: string | null; url: string | null }> {
  const tryUrl = async (suffix: string) => {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(suffix)}`;
      const res = await fetch(url, { headers: { "User-Agent": VYNL_USER_AGENT } });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        summary: data.extract || "",
        imageUrl: data.thumbnail?.source || data.originalimage?.source || null,
        url: data.content_urls?.desktop?.page || null,
      };
    } catch {
      return null;
    }
  };

  return (
    (await tryUrl(artistName)) ||
    (await tryUrl(artistName + " (musician)")) ||
    (await tryUrl(artistName + " (singer)")) ||
    (await tryUrl(artistName + " (band)")) ||
    { summary: "", imageUrl: null, url: null }
  );
}

/** Download artist image from URL and save to public/artists/ */
async function downloadArtistImage(imageUrl: string, artistName: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { headers: { "User-Agent": VYNL_USER_AGENT } });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const buffer = Buffer.from(await res.arrayBuffer());

    const artistsDir = path.join(process.cwd(), "public", "artists");
    if (!fs.existsSync(artistsDir)) {
      fs.mkdirSync(artistsDir, { recursive: true });
    }

    const hash = crypto.createHash("md5").update(artistName).digest("hex");
    const filename = `${hash}.${ext}`;
    fs.writeFileSync(path.join(artistsDir, filename), buffer);

    return `/api/artist-images/${filename}`;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// Wikipedia discography chart parsing
// ──────────────────────────────────────────────────────────────────

/**
 * Parse chart hits from a specific HTML section containing chart tables.
 * Extracts titles from <th scope="row"> and chart positions from <td> cells.
 * Only includes songs with peak ≤ 100.
 */
function parseChartTable(sectionHtml: string): ChartHit[] {
  const hits: ChartHit[] = [];

  // Find all tables in this section
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(sectionHtml)) !== null) {
    const table = tableMatch[0];

    // Parse all rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let currentYear: number | null = null;

    while ((rowMatch = rowRegex.exec(table)) !== null) {
      const rowContent = rowMatch[1];

      // Extract title from <th scope="row">
      const titleMatch = rowContent.match(/<th[^>]*scope\s*=\s*"row"[^>]*>([\s\S]*?)<\/th>/i);
      if (!titleMatch) continue;

      let title = stripHtml(titleMatch[1])
        .replace(/["""\u201c\u201d]/g, "")    // Strip double-quote characters only
        .trim();

      // Clean up "(featuring ...)" and "(with ...)" suffixes for display
      title = title.replace(/\s*\((featuring|with)\s.*$/i, "").trim();

      if (!title || title.length < 2 || title.length > 100) continue;
      // Skip header-like rows
      if (/^title$/i.test(title) || /^single$/i.test(title)) continue;

      // Extract all <td> cells
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        // Strip HTML and references like [3]
        let cellText = stripHtml(cellMatch[1]).trim();
        cellText = cellText.replace(/\[.*?\]/g, "").trim();
        cells.push(cellText);
      }

      // Find year in cells
      for (const cell of cells) {
        const ym = cell.match(/^(19|20)\d{2}$/);
        if (ym) {
          currentYear = parseInt(ym[0]);
          break;
        }
      }

      // Find chart positions: cells that are ONLY a number 1-200
      let bestPeak: number | null = null;
      for (const cell of cells) {
        if (/^(19|20)\d{2}$/.test(cell)) continue;
        const numMatch = cell.match(/^(\d{1,3})$/);
        if (numMatch) {
          const num = parseInt(numMatch[1]);
          if (num >= 1 && num <= 200) {
            if (bestPeak === null || num < bestPeak) {
              bestPeak = num;
            }
          }
        }
      }

      // Only include songs that actually charted (peak ≤ 100)
      if (bestPeak !== null && bestPeak <= 100) {
        hits.push({
          title,
          year: currentYear,
          peak: bestPeak,
          weeks: null,
          chart: "Chart",
        });
      }
    }

    // If we found hits from this table, return them
    if (hits.length > 0) return hits;
  }

  return hits;
}

/**
 * Extract the "Singles" section from a Wikipedia discography HTML page.
 * Returns only the HTML between the Singles heading and the next h2.
 */
function extractSinglesSection(html: string): string | null {
  // Look for Singles section heading
  const singlesHeading = html.match(/>Singles<\/h2>/i);
  if (!singlesHeading || singlesHeading.index === undefined) return null;

  const start = singlesHeading.index;
  // Find next h2 after the singles section
  const nextH2 = html.indexOf("<h2", start + 20);
  return nextH2 > start ? html.slice(start, nextH2) : html.slice(start);
}

/**
 * Fetch chart hits from Wikipedia discography page.
 * Follows redirects and extracts the Singles section specifically.
 */
async function fetchWikipediaChartHits(artistName: string): Promise<ChartHit[]> {
  // Try singles-specific page first (some artists have separate pages)
  const pageNames = [
    artistName + " singles discography",
    artistName + " discography",
  ];

  for (const pageName of pageNames) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(pageName)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": VYNL_USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;

      const html = await res.text();

      // If we got a redirect page, follow it manually
      if (html.includes("<title>Redirect</title>")) {
        const hrefMatch = html.match(/href="([^"]+)"/);
        if (hrefMatch) {
          const redirectUrl = `https://en.wikipedia.org${hrefMatch[1]}`;
          const res2 = await fetch(redirectUrl, {
            headers: { "User-Agent": VYNL_USER_AGENT },
            signal: AbortSignal.timeout(15000),
          });
          if (!res2.ok) continue;
          const html2 = await res2.text();
          return parseFromDiscoPage(html2, pageName);
        }
      }

      return parseFromDiscoPage(html, pageName);
    } catch {
      // Page not found or parse failed, try next
    }
  }

  console.log(`[intel] No Wikipedia chart data found for "${artistName}"`);
  return [];
}

function parseFromDiscoPage(html: string, pageName: string): ChartHit[] {
  // Try to extract just the Singles section (for combined discography pages)
  const singlesSection = extractSinglesSection(html);
  if (singlesSection) {
    const hits = parseChartTable(singlesSection);
    if (hits.length > 0) {
      console.log(`[intel] Wikipedia singles from "${pageName}": ${hits.length} charted songs`);
      return hits;
    }
  }

  // For dedicated singles pages: try "As lead artist" section first
  const leadSection = extractLeadArtistSection(html);
  if (leadSection) {
    const hits = parseChartTable(leadSection);
    if (hits.length > 0) {
      console.log(`[intel] Wikipedia lead singles from "${pageName}": ${hits.length} charted songs`);
      return hits;
    }
  }

  // Last resort: parse all tables on the page
  // Only use this for pages that look like singles pages (has chart tables with song-like rows)
  if (pageName.includes("singles")) {
    const hits = parseChartTable(html);
    if (hits.length > 0) {
      console.log(`[intel] Wikipedia chart hits from "${pageName}": ${hits.length} charted songs (full page)`);
      return hits;
    }
  }

  return [];
}

/**
 * Extract the "As lead artist" section from a dedicated singles discography page.
 * Handles both <h2> and <h3> headings.
 */
function extractLeadArtistSection(html: string): string | null {
  // Match both <h2> and <h3> with optional attributes
  const heading = html.match(/<h[23][^>]*>As lead artist<\/h[23]>/i);
  if (!heading || heading.index === undefined) return null;

  const start = heading.index;
  // Find next h2 or h3 after this section
  const nextH = html.indexOf("<h", start + heading[0].length);
  const nextMatch = nextH > start ? html.slice(start, nextH) : html.slice(start);
  // Only use if it's substantial (has table content)
  return nextMatch.length > 500 ? nextMatch : null;
}

// ──────────────────────────────────────────────────────────────────
// Wikidata helpers
// ──────────────────────────────────────────────────────────────────

async function findWikidataQID(mbid: string): Promise<string | null> {
  try {
    const query = `SELECT ?item WHERE { ?item wdt:P434 "${mbid}". } LIMIT 1`;
    const url = `${WD_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, { headers: WD_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    const bindings = data.results?.bindings || [];
    if (bindings.length === 0) return null;
    const uri = bindings[0].item?.value;
    return uri ? uri.split("/").pop() || null : null;
  } catch {
    return null;
  }
}

async function fetchWikidataCertifications(qid: string): Promise<Certification[]> {
  try {
    const query = `
      SELECT ?workLabel ?certLabel ?count WHERE {
        ?work wdt:P175 wd:${qid}.
        ?work p:P166 ?certStmt.
        ?certStmt ps:P166 ?cert.
        ?cert rdfs:label ?certLabel. FILTER(LANG(?certLabel) = "en")
        FILTER(
          CONTAINS(LCASE(?certLabel), "gold") ||
          CONTAINS(LCASE(?certLabel), "platinum") ||
          CONTAINS(LCASE(?certLabel), "diamond")
        )
        OPTIONAL { ?certStmt pq:P1114 ?count. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      ORDER BY ?workLabel
      LIMIT 200
    `;
    const url = `${WD_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, { headers: WD_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    const certs: Certification[] = [];

    for (const b of data.results?.bindings || []) {
      const title = b.workLabel?.value;
      const label = (b.certLabel?.value || "").toLowerCase();
      const count = b.count?.value ? parseInt(b.count.value) : undefined;

      let type = "other";
      if (label.includes("diamond")) type = "diamond";
      else if (label.includes("platinum")) type = "platinum";
      else if (label.includes("gold")) type = "gold";
      else continue;

      const country = label.split(/\s/)[0]?.toUpperCase() || undefined;

      if (title) {
        certs.push({ title, type, count: count && !isNaN(count) ? count : undefined, country });
      }
    }
    return certs;
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────
// Master pipeline: merge chart data from all sources
// ──────────────────────────────────────────────────────────────────

function deduplicateHits(hits: ChartHit[]): ChartHit[] {
  const map = new Map<string, ChartHit>();

  for (const hit of hits) {
    const key = normalizeTitle(hit.title);
    if (!key || key.length < 2) continue;
    if (/^\d+$/.test(hit.title)) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...hit });
    } else {
      // Merge: keep the best data
      if (!existing.year && hit.year) existing.year = hit.year;
      if (hit.peak !== null && (existing.peak === null || hit.peak < existing.peak)) {
        existing.peak = hit.peak;
      }
      if (!existing.certification && hit.certification) existing.certification = hit.certification;
      if (hit.chart !== "MusicBrainz" && existing.chart === "MusicBrainz") {
        existing.chart = hit.chart;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ya = a.year || 9999;
    const yb = b.year || 9999;
    return ya - yb;
  });
}

async function fetchChartHitsAndCerts(
  artistName: string,
  mbid: string | null
): Promise<{ chartHits: ChartHit[]; certifications: Certification[] }> {
  // Source 1: Wikipedia discography — PRIMARY source for chart data
  const wikiHits = await fetchWikipediaChartHits(artistName);

  // Source 2: Wikidata certifications
  let certifications: Certification[] = [];
  if (mbid) {
    try {
      const qid = await findWikidataQID(mbid);
      if (qid) {
        certifications = await fetchWikidataCertifications(qid);
      }
    } catch {
      // Wikidata failed
    }
  }

  // Cross-reference certifications with chart hits
  for (const hit of wikiHits) {
    const normalized = normalizeTitle(hit.title);
    const cert = certifications.find((c) => normalizeTitle(c.title) === normalized);
    if (cert) {
      hit.certification = cert.count && cert.count > 1 ? `${cert.count}x ${cert.type}` : cert.type;
    }
  }

  const chartHits = deduplicateHits(wikiHits);
  return { chartHits, certifications };
}

// ──────────────────────────────────────────────────────────────────
// API route handlers
// ──────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const artistName = decodeURIComponent(name);

  const cached = db
    .select()
    .from(artistIntel)
    .where(sql`${artistIntel.artistName} = ${artistName}`)
    .get();

  if (!cached) {
    return NextResponse.json({ status: "not_enriched", artistName });
  }

  return NextResponse.json({
    status: "enriched",
    ...cached,
    genres: cached.genres ? JSON.parse(cached.genres) : [],
    chartHits: cached.chartHits ? JSON.parse(cached.chartHits) : [],
    certifications: cached.certifications ? JSON.parse(cached.certifications) : [],
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const artistName = decodeURIComponent(name);

  const forceRefresh = request.nextUrl.searchParams.get("force") === "true";

  const cached = db
    .select()
    .from(artistIntel)
    .where(sql`${artistIntel.artistName} = ${artistName}`)
    .get();

  if (!forceRefresh && cached && cached.fetchedAt) {
    const fetchedAt = new Date(cached.fetchedAt).getTime();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (fetchedAt > thirtyDaysAgo) {
      return NextResponse.json({
        status: "enriched",
        cached: true,
        ...cached,
        genres: cached.genres ? JSON.parse(cached.genres) : [],
        chartHits: cached.chartHits ? JSON.parse(cached.chartHits) : [],
        certifications: cached.certifications ? JSON.parse(cached.certifications) : [],
      });
    }
  }

  // Step 1: MusicBrainz artist search
  const mbArtist = await searchMusicBrainz(artistName);
  const mbid = mbArtist?.id || null;
  let bornDate: string | null = null;
  let bornPlace: string | null = null;
  let activeYears: string | null = null;
  let genres: string[] = [];

  if (mbid) {
    const fullArtist = await fetchMusicBrainzArtist(mbid);
    if (fullArtist) {
      const lifeSpan = fullArtist["life-span"];
      bornDate = lifeSpan?.begin || null;
      const endDate = lifeSpan?.ended ? lifeSpan.end : "present";
      if (bornDate) {
        activeYears = endDate
          ? `${bornDate.substring(0, 4)}–${endDate === "present" ? "present" : endDate.substring(0, 4)}`
          : null;
      }
      bornPlace = fullArtist["begin-area"]?.name || fullArtist.area?.name || null;
      genres = (fullArtist.tags || [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((t) => t.name);
    }
  }

  // Step 2: Wikipedia bio + image
  const wiki = await fetchWikipediaSummary(artistName);

  // Step 2b: Auto-download artist image
  let localImagePath: string | null = null;
  if (wiki.imageUrl) {
    localImagePath = await downloadArtistImage(wiki.imageUrl, artistName);
  }

  // Step 3: Chart hits + certifications
  const { chartHits, certifications } = await fetchChartHitsAndCerts(artistName, mbid);

  // Store in DB
  const data = {
    artistName,
    summary: wiki.summary || null,
    bornDate,
    bornPlace,
    genres: JSON.stringify(genres),
    activeYears,
    imageUrl: wiki.imageUrl || null,
    localImagePath,
    chartHits: JSON.stringify(chartHits),
    certifications: JSON.stringify(certifications),
    musicbrainzId: mbid,
    wikipediaUrl: wiki.url || null,
    fetchedAt: new Date().toISOString(),
  };

  if (cached) {
    db.update(artistIntel)
      .set(data)
      .where(sql`${artistIntel.artistName} = ${artistName}`)
      .run();
  } else {
    db.insert(artistIntel).values(data).run();
  }

  return NextResponse.json({
    status: "enriched",
    cached: false,
    ...data,
    genres,
    chartHits,
    certifications,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const artistName = decodeURIComponent(name);

  db.delete(artistIntel)
    .where(sql`${artistIntel.artistName} = ${artistName}`)
    .run();

  return NextResponse.json({ status: "cleared", artistName });
}
