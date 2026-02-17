import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wishList } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getLidarrConfig,
  searchArtist,
  getExistingArtists,
  addArtist,
} from "@/lib/lidarr";

// ── Background job state (persists across HMR) ─────────────────────

interface PushJob {
  status: "running" | "complete" | "cancelled" | "error";
  totalArtists: number;
  processed: number;
  added: number;
  skipped: number;
  errors: number;
  updatedItems: number;
  currentArtist?: string;
  errorMessage?: string;
}

const _g = globalThis as typeof globalThis & { __vynl_lidarrPush?: PushJob };
const g = {
  get pushJob(): PushJob | undefined { return _g.__vynl_lidarrPush; },
  set pushJob(v: PushJob | undefined) { _g.__vynl_lidarrPush = v; },
};

/** POST — start a push job */
export async function POST() {
  if (g.pushJob?.status === "running") {
    return NextResponse.json({ error: "Job already running" }, { status: 409 });
  }

  const config = await getLidarrConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Lidarr not configured. Set up in Settings first." },
      { status: 400 }
    );
  }

  if (!config.rootFolderPath || !config.qualityProfileId || !config.metadataProfileId) {
    return NextResponse.json(
      { error: "Lidarr config incomplete — test the connection first to auto-detect profiles." },
      { status: 400 }
    );
  }

  // Load pending wishlist items
  const items = db
    .select()
    .from(wishList)
    .where(eq(wishList.status, "pending"))
    .all();

  if (items.length === 0) {
    return NextResponse.json({ error: "No pending wishlist items" }, { status: 400 });
  }

  // Group by unique artist (case-insensitive)
  const artistMap = new Map<string, typeof items>();
  for (const item of items) {
    const artist = (item.seedArtist || "").trim();
    if (!artist) continue;
    const key = artist.toLowerCase();
    let group = artistMap.get(key);
    if (!group) {
      group = [];
      artistMap.set(key, group);
    }
    group.push(item);
  }

  const job: PushJob = {
    status: "running",
    totalArtists: artistMap.size,
    processed: 0,
    added: 0,
    skipped: 0,
    errors: 0,
    updatedItems: 0,
  };
  g.pushJob = job;

  // Fire-and-forget — run in background
  (async () => {
    try {
      // Fetch existing artists from Lidarr for skip-detection
      let existing: Map<string, number>;
      try {
        existing = await getExistingArtists(config.url, config.apiKey);
      } catch {
        existing = new Map();
      }

      for (const [, groupItems] of artistMap) {
        if (job.status === "cancelled") break;

        const artistName = (groupItems[0].seedArtist || "").trim();
        job.currentArtist = artistName;

        try {
          // Search Lidarr for this artist
          const results = await searchArtist(config.url, config.apiKey, artistName);

          if (results.length === 0) {
            job.skipped++;
            job.processed++;
            continue;
          }

          const best = results[0];

          // Already in Lidarr?
          if (existing.has(best.foreignArtistId)) {
            job.skipped++;
            job.processed++;
            // Still mark wishlist items as "downloading" since artist is monitored
            const ids = groupItems.map((i) => i.id);
            for (const id of ids) {
              db.update(wishList)
                .set({ status: "downloading" })
                .where(eq(wishList.id, id))
                .run();
              job.updatedItems++;
            }
            continue;
          }

          // Add artist to Lidarr
          await addArtist(config.url, config.apiKey, {
            foreignArtistId: best.foreignArtistId,
            artistName: best.artistName,
            rootFolderPath: config.rootFolderPath!,
            qualityProfileId: config.qualityProfileId!,
            metadataProfileId: config.metadataProfileId!,
            monitored: true,
            searchForMissingAlbums: true,
          });

          existing.set(best.foreignArtistId, -1); // Prevent re-adding in same run
          job.added++;

          // Update wishlist items to "downloading"
          const ids = groupItems.map((i) => i.id);
          for (const id of ids) {
            db.update(wishList)
              .set({ status: "downloading" })
              .where(eq(wishList.id, id))
              .run();
            job.updatedItems++;
          }
        } catch (err) {
          job.errors++;
          job.errorMessage = err instanceof Error ? err.message : String(err);
        }

        job.processed++;

        // Rate limit: 200ms between API calls
        if (job.status === "running") {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (job.status === "running") {
        job.status = "complete";
      }
    } catch (err) {
      job.status = "error";
      job.errorMessage = err instanceof Error ? err.message : String(err);
    }
    job.currentArtist = undefined;
  })();

  return NextResponse.json({ started: true, totalArtists: artistMap.size });
}

/** GET — poll job status */
export async function GET() {
  if (!g.pushJob) {
    return NextResponse.json({ status: "idle" });
  }
  return NextResponse.json(g.pushJob);
}

/** DELETE — cancel running job */
export async function DELETE() {
  if (g.pushJob?.status === "running") {
    g.pushJob.status = "cancelled";
    return NextResponse.json({ cancelled: true });
  }
  // Clear completed/idle job state
  g.pushJob = undefined;
  return NextResponse.json({ cleared: true });
}
