import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql, count } from "drizzle-orm";
import * as sonos from "@/lib/sonos";

interface SpotifySample {
  title: string;
  artist: string;
  album?: string;
  spotifyUri?: string;
  source: "spotify";
}

// Curated seed queries per genre for Spotify discovery
const GENRE_SEEDS: Record<string, string[]> = {
  Rock: ["classic rock hits", "alternative rock", "rock anthems"],
  Pop: ["pop hits", "indie pop", "synth pop"],
  Jazz: ["jazz standards", "modern jazz", "jazz fusion"],
  Classical: ["classical masterpieces", "piano classical", "orchestral"],
  "Hip-Hop": ["hip hop classics", "rap hits", "underground hip hop"],
  "R&B": ["r&b soul", "modern r&b", "neo soul"],
  Country: ["country hits", "country classics", "modern country"],
  Blues: ["blues guitar", "chicago blues", "modern blues"],
  Metal: ["heavy metal", "progressive metal", "metal classics"],
  Folk: ["folk music", "indie folk", "acoustic folk"],
  Indie: ["indie music", "indie rock", "indie alternative"],
  Reggae: ["reggae classics", "roots reggae", "modern reggae"],
  Latin: ["latin music", "salsa", "latin pop"],
  Afrobeat: ["afrobeat", "afrobeats hits", "african music"],
  Soul: ["soul music", "soul classics", "motown"],
  Funk: ["funk music", "funk classics", "modern funk"],
  Punk: ["punk rock", "punk classics", "pop punk"],
  // Electronic sub-genres
  House: ["house music", "classic house", "deep house tracks"],
  Techno: ["techno music", "detroit techno", "dark techno"],
  Trance: ["trance music", "uplifting trance", "classic trance"],
  "Vocal Trance": ["vocal trance", "vocal trance hits", "female vocal trance"],
  "Drum & Bass": ["drum and bass", "liquid dnb", "jungle music"],
  Dubstep: ["dubstep", "melodic dubstep", "bass music"],
  Ambient: ["ambient music", "chillout", "ambient electronic"],
  Downtempo: ["downtempo", "trip hop downtempo", "chillout lounge"],
  IDM: ["idm music", "intelligent dance music", "experimental electronic"],
  Synthwave: ["synthwave", "retrowave", "outrun music"],
  "Deep House": ["deep house", "deep house classics", "melodic deep house"],
  "Progressive House": ["progressive house", "progressive trance", "progressive electronic"],
  Minimal: ["minimal techno", "minimal house", "minimal electronic"],
  Hardstyle: ["hardstyle", "hard dance", "euphoric hardstyle"],
  "Lo-Fi": ["lofi hip hop", "lofi beats", "lofi chill"],
  "Trip-Hop": ["trip hop", "massive attack", "bristol sound"],
  Garage: ["uk garage", "2-step garage", "speed garage"],
  Breakbeat: ["breakbeat", "big beat", "breaks music"],
};

// Map slider values to search modifiers
function getTempoModifier(tempo: number): string {
  if (tempo <= 2) return "slow downtempo";
  if (tempo <= 4) return "relaxed";
  if (tempo <= 6) return "";
  if (tempo <= 8) return "upbeat driving";
  return "fast high tempo";
}

function getEnergyModifier(energy: number): string {
  if (energy <= 2) return "chill ambient mellow";
  if (energy <= 4) return "calm";
  if (energy <= 6) return "";
  if (energy <= 8) return "energetic uplifting";
  return "intense powerful high energy";
}

// Curated seeds that vary by tempo range for electronic genres
const TEMPO_GENRE_SEEDS: Record<string, Record<string, string[]>> = {
  Trance: {
    slow: ["balearic trance", "ambient trance", "chillout trance"],
    mid: ["progressive trance", "melodic trance", "trance classics"],
    fast: ["uplifting trance", "psytrance", "hard trance 140 bpm"],
  },
  "Vocal Trance": {
    slow: ["vocal trance ballad", "emotional trance"],
    mid: ["vocal trance", "vocal trance classics"],
    fast: ["uplifting vocal trance", "epic vocal trance"],
  },
  House: {
    slow: ["deep house chill", "lounge house"],
    mid: ["house music", "classic house", "funky house"],
    fast: ["tech house", "speed garage", "tribal house"],
  },
  Techno: {
    slow: ["dub techno", "ambient techno", "minimal techno"],
    mid: ["detroit techno", "techno classics"],
    fast: ["hard techno", "industrial techno", "acid techno fast"],
  },
  "Drum & Bass": {
    slow: ["liquid drum and bass", "atmospheric dnb"],
    mid: ["drum and bass", "dnb classics"],
    fast: ["jump up dnb", "neurofunk", "fast jungle"],
  },
  Hardstyle: {
    slow: ["euphoric hardstyle", "hardstyle melodic"],
    mid: ["hardstyle classics", "hardstyle anthems"],
    fast: ["rawstyle", "hardcore hardstyle", "hard dance fast"],
  },
};

function getTempoRange(tempo: number): "slow" | "mid" | "fast" {
  if (tempo <= 4) return "slow";
  if (tempo <= 7) return "mid";
  return "fast";
}

export async function GET(request: NextRequest) {
  const genres = request.nextUrl.searchParams.get("genres");
  const genreList = genres ? genres.split(",") : [];
  const tempo = parseInt(request.nextUrl.searchParams.get("tempo") || "5");
  const energy = parseInt(request.nextUrl.searchParams.get("energy") || "5");
  const era = request.nextUrl.searchParams.get("era") || "any";

  // Check local library first
  const [{ total }] = db.select({ total: count() }).from(tracks).all();

  if (total > 0) {
    const samples = db
      .select()
      .from(tracks)
      .orderBy(sql`RANDOM()`)
      .limit(20)
      .all();

    return NextResponse.json({
      tracks: samples.map((t) => ({ ...t, source: "local" })),
      source: "local",
    });
  }

  // No local tracks — search Spotify
  // Find a Sonos speaker for playback
  let speakerName: string | null = null;
  try {
    const speakers = await sonos.discover();
    if (speakers.length > 0) speakerName = speakers[0].name;
  } catch {}

  const spotifyTracks: SpotifySample[] = [];

  // Build search queries from selected genres, incorporating tempo/energy
  const tempoRange = getTempoRange(tempo);
  const tempoMod = getTempoModifier(tempo);
  const energyMod = getEnergyModifier(energy);
  const eraMod = era !== "any" ? era : "";

  const queries: string[] = [];
  for (const genre of genreList) {
    // Check if we have tempo-specific seeds for this genre
    const tempoSeeds = TEMPO_GENRE_SEEDS[genre];
    if (tempoSeeds) {
      const seeds = tempoSeeds[tempoRange];
      const seed = seeds[Math.floor(Math.random() * seeds.length)];
      queries.push([seed, eraMod].filter(Boolean).join(" "));
    } else {
      // Use generic genre seeds + modifiers
      const seeds = GENRE_SEEDS[genre];
      if (seeds) {
        const seed = seeds[Math.floor(Math.random() * seeds.length)];
        queries.push([seed, tempoMod, energyMod, eraMod].filter(Boolean).join(" "));
      }
    }
  }

  // If no genres selected, use varied defaults
  if (queries.length === 0) {
    queries.push("top hits", "classic songs", "popular music");
  }

  // Check if Spotify credentials are configured
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return NextResponse.json({
      tracks: [],
      source: "none",
      error: "No local tracks and SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not configured in .env.local",
    });
  }

  // Search Spotify for each query
  for (const query of queries.slice(0, 5)) {
    try {
      const results = await sonos.searchSpotify(query, 5);

      for (const item of results) {
        // Parse artist from subtitle: "Artist — Album"
        let artist = "Unknown";
        let album: string | undefined;
        if (item.subtitle) {
          const parts = item.subtitle.split(" — ");
          artist = parts[0] || "Unknown";
          album = parts[1];
        }

        spotifyTracks.push({
          title: item.title || item.name || "Unknown",
          artist: item.artist || artist,
          album: item.album || album,
          spotifyUri: item.uri,
          source: "spotify",
        });
      }
    } catch (err) {
      console.error(`Spotify search failed for "${query}":`, err);
    }
  }

  // Filter out tracks without URIs, then dedupe
  const withUri = spotifyTracks.filter((t) => t.spotifyUri);
  const seen = new Set<string>();
  const deduped = withUri.filter((t) => {
    const key = `${t.title}|${t.artist}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Shuffle
  for (let i = deduped.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deduped[i], deduped[j]] = [deduped[j], deduped[i]];
  }

  return NextResponse.json({
    tracks: deduped.slice(0, 20),
    source: "spotify",
    speakerName,
  });
}
