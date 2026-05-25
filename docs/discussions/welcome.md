## Welcome to Vynl 👋

Vynl is a self-hosted music platform. The pitch: your music, your hardware, your rules — Spotify-grade discovery and a Sonos-compatible playback layer running entirely on your own NAS or homelab. No subscriptions, no streaming fees, no algorithm controlling what you hear.

**This Discussions space is for the more casual side of the conversation:**

- 💡 **Ideas** — "wouldn't it be cool if Vynl could…" thoughts. Half-formed is fine.
- 🎉 **Show and tell** — your library, your setup, screenshots, the weird hack you did that ended up working.
- 🙋 **Q&A** — questions about installation, configuration, integration. Browse first; answered questions are searchable.
- 🗣️ **General** — anything else.

For concrete things, use the **[Issue Templates](https://github.com/48Nauts-Operator/vynl-app/issues/new/choose)** instead:

- Bug Report — something's broken
- Feature Request — a fully-baked proposal
- Idea — a rough proposal that's not quite a feature yet
- Feedback — short-form impressions, both 🎉 and 😕

## How Vynl is built

- Next.js 15 (App Router) + React 19 + TypeScript strict
- SQLite (via `better-sqlite3`) for everything — no external DB
- `beets` for the music library backend
- `@svrooij/sonos` for in-process Sonos discovery + control
- ffmpeg + chromaprint + spotdl + yt-dlp baked into the production Docker image
- LLM provider-agnostic: Anthropic / OpenRouter / Ollama / LM Studio

## Where the project is going

There's an explicit vision around making your library independent of streaming services and building a **closed-loop DJ pipeline** (YouTube → decompose → identify → download → learn → generate). The roadmap discussion has the details — see the pinned thread.

Browse the [open issues](https://github.com/48Nauts-Operator/vynl-app/issues) for what's in flight; the [`docs/`](https://github.com/48Nauts-Operator/vynl-app/tree/main/docs) directory has feature specs, an operations cheatsheet, and the running plan.

## Getting started

```bash
# Quickest: just pull the published image
docker pull cand0rian/vynl-app:latest

# Or from GHCR
docker pull ghcr.io/48nauts-operator/vynl-app:latest
```

See the [README](https://github.com/48Nauts-Operator/vynl-app#readme) for compose / env setup.

Welcome aboard. Lurk, ask, or build — whichever fits.
