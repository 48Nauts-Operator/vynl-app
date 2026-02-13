# Album Browsing

Browse your music library by album with grid and list views, sorting, genre filtering, inline playback, and album management via right-click context menu.

## Quick Start

1. Click **Albums** in the sidebar
2. Toggle between **Grid** and **List** view using the icons in the top bar
3. Filter by genre or sort by artist, name, year, or recently added
4. Right-click any album for quick actions

## View Modes

### Grid View (default)

Card-based layout with album cover art, name, artist, year, and track count. Album cards scale responsively:

| Breakpoint | Columns |
|------------|---------|
| Mobile | 2 |
| Small | 3 |
| Medium | 4 |
| Large | 5 |
| XL | 6 |

Hover over a card to reveal the **Play** button overlay on the cover art.

### List View

Compact row-based layout showing:
- 48px album thumbnail
- Album name and artist/year
- Track count and total duration
- Hover play button

Best for large libraries where you want to see more albums at once without scrolling.

## Sorting

| Sort | Description |
|------|-------------|
| **By Artist** (default) | Alphabetical by album artist |
| **By Name** | Alphabetical by album title |
| **By Year** | Chronological (newest first) |
| **Recently Added** | Most recently scanned first |

## Genre Filtering

The genre dropdown shows all unique genres in your library. Select a genre to filter the album list. Select "All genres" to reset.

## Context Menu

Right-click any album (grid or list view) to access:

| Action | Description |
|--------|-------------|
| **Play Album** | Queue all tracks and start playback |
| **Find Cover Art** | Open the cover art search dialog (searches online for album art) |
| **Rename Album** | Change the album name and/or album artist in the database |

## Album Detail Page

Click an album to view its track listing at `/albums/[artist]---[album]`. The detail page shows:
- Full cover art
- Track listing with numbers, titles, artists, durations
- Play individual tracks or the full album

## API Reference

### `GET /api/albums`

List all albums with optional sort and genre filter.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sort` | string | `"artist"` | Sort order: `artist`, `name`, `year`, `recent` |
| `genre` | string | — | Filter by genre |

**Response:**
```json
{
  "albums": [
    {
      "album": "Abbey Road",
      "album_artist": "The Beatles",
      "year": 1969,
      "cover_path": "/covers/abc123.jpg",
      "genre": "Rock",
      "track_count": 17,
      "total_duration": 2835,
      "first_track_id": 42
    }
  ],
  "genres": ["Rock", "Electronic", "Jazz", "Classical"]
}
```

### `GET /api/albums/[id]`

Get album details and track listing. The `id` is `{artist}---{album}` (URI encoded).

### `POST /api/albums/rename`

Rename an album and/or its artist.

**Body:**
```json
{
  "oldAlbum": "Abby Road",
  "oldAlbumArtist": "The Beatles",
  "newAlbum": "Abbey Road",
  "newAlbumArtist": "The Beatles"
}
```

## File Structure

```
src/
  app/
    albums/
      page.tsx                    # Album grid/list browser
      [id]/
        page.tsx                  # Album detail + track listing
    api/
      albums/
        route.ts                  # Album listing API
        [id]/route.ts             # Single album detail API
        rename/route.ts           # Album rename API
  components/
    albums/
      CoverSearchDialog.tsx       # Online cover art search
```
