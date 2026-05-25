## Summary

Paste any YouTube URL → get audio in your Vynl library. Wraps the `yt-dlp` binary shipped in the image (v0.6.25) in a UI.

## Why

Lots of music lives on YouTube: official channels, live sets, mixes, talks, podcasts. Today the only way to get it into Vynl is manual yt-dlp from the command line. A first-class UI turns YouTube into another ingest source on equal footing with Spotify migration + direct file import.

This is also the entry point for the "DJ pipeline" — every downstream feature (set decomposition, AI DJ corpus learning) depends on YouTube audio landing in the library.

## UX

New page `/downloader` (or surface in `/podcasts` / `/party`):

1. Paste URL → click **Preview**
2. Vynl runs `yt-dlp --skip-download --dump-json` → shows metadata: title, duration, uploader, chapter count, playlist size
3. Three mode buttons (greyed unless detected):
   - **Single MP3** (default) — one file, full duration
   - **Split by chapters** — one MP3 per YouTube chapter (auto-tracklist for DJ sets)
   - **Whole playlist** — every video in the playlist as separate MP3s
4. **Download** kicks off a background job with live progress (per-track success/fail like the spotDL migration flow)
5. Files land in `MUSIC_LIBRARY_PATH`; the file watcher imports them to beets + Vynl tracks

## Backend

- `POST /api/youtube/preview` `{url}` → metadata-only response (`yt-dlp --skip-download --dump-json`)
- `POST /api/youtube/download` `{url, mode, audioFormat?, outputTemplate?}` → starts background job
- `GET  /api/youtube/download` → poll status (same shape as `/api/spotify/migration/download`)
- `DELETE /api/youtube/download` → cancel mid-flight

yt-dlp invocation reference:
```bash
# Single MP3, with metadata + thumbnail
yt-dlp -x --audio-format mp3 --embed-metadata --embed-thumbnail \
  -o "$MUSIC_LIBRARY_PATH/Downloads/%(uploader)s - %(title)s.%(ext)s" "$URL"

# Split by chapters
yt-dlp -x --audio-format mp3 --split-chapters \
  -o "chapter:$MUSIC_LIBRARY_PATH/Downloads/%(title)s/%(section_number)02d - %(section_title)s.%(ext)s" "$URL"

# Whole playlist
yt-dlp -x --audio-format mp3 --yes-playlist \
  -o "$MUSIC_LIBRARY_PATH/Downloads/%(playlist_title)s/%(playlist_index)02d - %(title)s.%(ext)s" "$URL"
```

## Out of scope (separate issues)

- Identifying tracks within a DJ-set MP3 → DJ set decomposer (#85)
- Using identified sets as AI DJ training data → AI DJ corpus learning (#86)

## Acceptance

- [ ] `/downloader` page renders
- [ ] Paste URL + Preview shows metadata
- [ ] Download in single-MP3 mode lands a file + imports it
- [ ] Download in split-by-chapters mode produces one MP3 per chapter into a folder named after the source video
- [ ] Background job has live progress UI with cancel
- [ ] Failed downloads surface the yt-dlp stderr inline, not silently
- [ ] `--max-filesize 2G` (or similar) guard against accidentally pulling a 10-hour livestream

## Sized

~1 day (backend orchestrator ~3h, UI ~3h, edge cases + cancel + error handling ~2h).
