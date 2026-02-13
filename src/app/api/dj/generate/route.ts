// [VynlDJ] — extractable: DJ set generation API endpoint
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks, trackRatings, trackAudioFeatures, djSessions, djSessionTracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateDjSet, selectCatalogForDj, type CatalogTrack, type DjSetupParams } from "@/lib/dj";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const params: DjSetupParams = {
      audience: body.audience || ["All ages"],
      vibe: body.vibe || "mixed",
      durationMinutes: body.durationMinutes || 120,
      occasion: body.occasion || "house_party",
      specialRequests: body.specialRequests,
    };

    // Fetch full catalog with ratings and audio features
    const allTracks = db.select().from(tracks).all();
    const allRatings = db.select().from(trackRatings).all();
    const ratingMap = new Map(allRatings.map((r) => [r.trackId, r.rating]));

    const allFeatures = db.select().from(trackAudioFeatures).all();
    const featureMap = new Map(allFeatures.map((f) => [f.trackId, f]));

    const catalog: CatalogTrack[] = allTracks.map((t) => {
      const feat = featureMap.get(t.id);
      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        genre: t.genre,
        year: t.year,
        duration: t.duration,
        playCount: t.playCount ?? 0,
        rating: ratingMap.get(t.id) ?? null,
        bpm: feat?.bpm ?? null,
        energy: feat?.energy ?? null,
        danceability: feat?.danceability ?? null,
        key: feat?.key ?? null,
        camelot: feat?.camelot ?? null,
        genreRefined: feat?.genreRefined ?? null,
        styleTags: feat?.styleTags ? JSON.parse(feat.styleTags) : null,
      };
    });

    if (catalog.length === 0) {
      return NextResponse.json(
        { error: "No tracks in library. Import music first." },
        { status: 400 }
      );
    }

    // Pre-filter catalog to fit context window and match vibe
    const filteredCatalog = selectCatalogForDj(catalog, params);
    console.log(
      `DJ catalog: ${catalog.length} total → ${filteredCatalog.length} selected for "${params.vibe}" vibe` +
      (params.specialRequests ? ` (special: "${params.specialRequests}")` : "")
    );

    if (filteredCatalog.length === 0) {
      return NextResponse.json(
        { error: "No tracks match the selected vibe and filters. Try a different vibe or broader request." },
        { status: 400 }
      );
    }

    // Generate the DJ set via LLM
    const startTime = Date.now();
    const result = await generateDjSet(params, filteredCatalog);
    console.log(`DJ set generated in ${((Date.now() - startTime) / 1000).toFixed(1)}s — ${result.setList.length} tracks`);

    // Persist the session
    const [session] = db
      .insert(djSessions)
      .values({
        audience: JSON.stringify(params.audience),
        vibe: params.vibe,
        durationMinutes: params.durationMinutes,
        occasion: params.occasion,
        specialRequests: params.specialRequests,
        djNotes: result.djNotes,
        trackCount: result.setList.length,
        status: "ready",
      })
      .returning()
      .all();

    // Insert session tracks
    const sessionTrackValues = result.setList.map((item, i) => ({
      sessionId: session.id,
      trackId: item.trackId,
      position: i,
      djNote: item.note,
    }));
    db.insert(djSessionTracks).values(sessionTrackValues).run();

    // Build the response with full track data + DJ notes + audio features
    const trackMap = new Map(allTracks.map((t) => [t.id, t]));
    const djTracks = result.setList
      .map((item, i) => {
        const track = trackMap.get(item.trackId);
        if (!track) return null;
        const feat = featureMap.get(track.id);
        return {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          albumArtist: track.albumArtist,
          duration: track.duration,
          filePath: track.filePath,
          coverPath: track.coverPath,
          source: track.source as "local",
          sourceId: track.sourceId,
          position: i,
          djNote: item.note,
          bpm: feat?.bpm ?? null,
          energy: feat?.energy ?? null,
          key: feat?.key ?? null,
          camelot: feat?.camelot ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      session: {
        id: session.id,
        audience: session.audience,
        vibe: session.vibe,
        durationMinutes: session.durationMinutes,
        occasion: session.occasion,
        specialRequests: session.specialRequests,
        djNotes: session.djNotes,
        trackCount: session.trackCount,
        status: session.status,
        createdAt: session.createdAt,
      },
      tracks: djTracks,
    });
  } catch (err) {
    console.error("DJ generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DJ generation failed" },
      { status: 500 }
    );
  }
}
