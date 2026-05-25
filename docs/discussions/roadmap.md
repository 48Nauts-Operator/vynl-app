## Roadmap: where Vynl is going

The big architectural through-line right now is the **DJ pipeline** — a closed loop that takes a YouTube link and ends in a smarter AI DJ. Every piece composes on top of what Vynl already has (library, beets, audio toolchain, Sonos, LLM stack); none of it requires new external dependencies.

### The pipeline

```
YouTube DJ set / mix
  → yt-dlp downloads MP3
  → fpcalc + AcoustID windowed identifies original tracks
  → spotDL grabs each identified track at full quality
  → Imported to local library (via existing file watcher)
  → Local audio features extracted (BPM / key / energy)
  → Set stored as reference data with features
  → AI DJ uses corpus + features to generate sets that actually
    sound like real DJs build them
```

### Tracking issues

| # | Issue | Status |
|---|---|---|
| #84 | [Vynl YouTube downloader UI (yt-dlp wrapper)](https://github.com/48Nauts-Operator/vynl-app/issues/84) | Open |
| #85 | [DJ set decomposer (windowed AcoustID → tracklist)](https://github.com/48Nauts-Operator/vynl-app/issues/85) | Open, depends on #84 |
| #86 | [AI DJ learns from decomposed reference sets](https://github.com/48Nauts-Operator/vynl-app/issues/86) | Open, depends on #85 |
| #87 | [DJ Trainer — "Name That Track" game](https://github.com/48Nauts-Operator/vynl-app/issues/87) | Open, dependency-light |

(Numbers will appear here once `scripts/create-vision-issues.sh` runs against the GitHub mirror.)

### What's already done (recent releases)

- **v0.6.23** — Spotify Migration Wizard v1 (browse + select + add to wishlist)
- **v0.6.24** — Wizard v2: real downloads via spotDL, "Not Found" bucket for failed lookups
- **v0.6.25** — spotdl + yt-dlp baked into the Docker image (first build where the download paths actually work)
- **v0.6.26** — contribution surface: issue templates, this Discussions space, CONTRIBUTING.md

### Vote with reactions

👍 on this thread if the DJ pipeline excites you. ❤️ on the issue you most want to see ship first. Comment with anything you'd add to the chain.

### Out of scope / explicit non-goals

- **Vynl is not a Spotify client.** The Spotify integration is migration-only — connect, pull what you have, then disconnect. Once your library is curated, you don't need Spotify anymore.
- **No paid third-party services** as load-bearing dependencies. AcoustID, AcoustID's app key (free tier), and the public Spotify Developer API for migration are fine; we're not building on Beatport, Tidalift, etc.
- **Local-first.** Everything except the Spotify migration tunnel runs on your own hardware. The whole point.
