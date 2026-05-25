# Contributing to Vynl

Thanks for your interest. Vynl is a self-hosted music platform (Next.js + beets + Sonos) — small enough to be moved by individual contributions, opinionated enough that there's a clear direction.

## TL;DR

| You want to… | Use this |
|---|---|
| Report a bug | [Bug Report](https://github.com/48Nauts-Operator/vynl-app/issues/new?template=bug_report.yml) |
| Suggest a concrete feature | [Feature Request](https://github.com/48Nauts-Operator/vynl-app/issues/new?template=feature_request.yml) |
| Float a rough idea | [Idea](https://github.com/48Nauts-Operator/vynl-app/issues/new?template=idea.yml) |
| Leave general feedback | [Feedback](https://github.com/48Nauts-Operator/vynl-app/issues/new?template=feedback.yml) |
| Have a casual chat or ask a question | [Discussions](https://github.com/48Nauts-Operator/vynl-app/discussions) |
| Send a code change | Read [Code contributions](#code-contributions) first |

Good first issues are tagged `good first issue` once triaged. Anything tagged `idea` is up for grabs to refine into a feature request.

## Project direction

Vynl exists to make you **independent of streaming services**. That's the litmus test for new features — does it strengthen your control over your own music library, or does it add dependence on a third party?

Spotify integration is **migration-only**: connect once, pull what you have, then disconnect. Vynl isn't trying to be a Spotify client. The bigger architectural through-line right now is the **DJ pipeline**: YouTube → decompose → identify → download → learn → generate. See [`docs/issues/`](docs/issues/) for the planned features that compose into that.

## Reporting a bug

Use the [Bug Report template](https://github.com/48Nauts-Operator/vynl-app/issues/new?template=bug_report.yml). The form asks for:
- What happened vs. what you expected
- Steps to reproduce
- Vynl version (Settings → About, or `docker exec vynl node -e "console.log(require('/app/package.json').version)"`)
- Relevant logs (use Dozzle or `docker logs vynl --tail 50` and grep)

For security issues, **don't open a public issue** — email `hello@48nauts.com`. Responses within 7 days.

## Suggesting a feature

For fully-formed proposals use [Feature Request](https://github.com/48Nauts-Operator/vynl-app/issues/new?template=feature_request.yml). For rough "wouldn't it be cool if…" thoughts, [Idea](https://github.com/48Nauts-Operator/vynl-app/issues/new?template=idea.yml) is lighter and a Discussion is even lighter still. The maintainer reads all of them.

## Code contributions

### Repo flow (important to know)

The canonical code lives on a **private Forgejo instance** (maintainer's NAS). GitHub here is the **release mirror** — `main` is updated by an automated workflow that pushes from UAT. This means:

- **PRs land on GitHub `main`** and the maintainer back-ports them to Forgejo `development` manually. There may be a small delay before your PR appears in a release.
- **Open an issue or Idea first** for non-trivial code — that's the fastest way to get a green light before you spend time on a PR that might conflict with in-flight changes.
- For tiny fixes (typos, obvious bugs), feel free to skip straight to a PR.

### Stack

- **Frontend / Backend**: Next.js 15 App Router (React 19, TypeScript strict), Tailwind v4, framer-motion, lucide-react.
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM (single-file `vynl.db` — no PostgreSQL or external DB).
- **Audio toolchain**: ffmpeg, chromaprint (`fpcalc`), `spotdl`, `yt-dlp` — all baked into the production Docker image.
- **Library backend**: beets, with the beets DB at `/library` in the container.
- **Sonos**: in-process discovery via `@svrooij/sonos`.
- **LLMs**: provider-agnostic — Anthropic, OpenRouter, Ollama, LM Studio.

### Dev setup

Requires Node 20+. Optional: Python 3 + ffmpeg + chromaprint locally if you're touching identify / Spotify download paths; otherwise mock them.

```bash
git clone https://github.com/48Nauts-Operator/vynl-app.git
cd vynl-app
npm ci
npm run dev      # Next.js on http://localhost:3101
```

The DB auto-creates on first run at `./vynl.db` in the repo root (or wherever `VYNL_DB_DIR` points). Idempotent migrations live in `src/lib/db/index.ts` and run on startup.

Production reference: pull `cand0rian/vynl-app:latest` from Docker Hub or `ghcr.io/48nauts-operator/vynl-app:latest` from GHCR. See [`docs/operations-cheatsheet.html`](docs/operations-cheatsheet.html) for ops commands.

### Project structure

```
src/
├── app/              # Next.js App Router
│   ├── api/         # API routes (server)
│   └── */page.tsx   # UI pages
├── components/       # Shared React components
├── hooks/            # React hooks
├── lib/              # Server + shared utilities
│   ├── db/          # Drizzle schema + idempotent migrations
│   ├── llm/         # Provider-agnostic LLM client
│   └── *.ts         # Domain modules: sonos, spotify, identify, beets, etc.
└── store/            # Zustand stores
```

### Standards

- `npm run typecheck` (strict TS) must pass.
- `npm run lint` (Next.js eslint) must pass.
- **Small focused PRs** > big bundles. A 200-line PR with one clear purpose lands faster than a 2000-line refactor.
- **No dependency creep without justification.** New npm packages: mention what they do in the PR description.
- **Conventional Commits** — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`, `test:`. Used for the auto-generated changelog.
- **Smoke-test in a browser** — typecheck + lint don't catch UX regressions.

### Before opening a PR

- Run `npm run typecheck` and `npm run lint` locally.
- Test the change in the browser (start `npm run dev`, exercise the path).
- Reference the issue your PR closes in the description (`Closes #123`).
- Bonus: include a screenshot or 5-second screen recording for UI changes.

### Areas that always need help

- **Documentation** — feature specs, the operations cheatsheet, in-product help text.
- **Tests** — Vynl is light on tests today; adding coverage to anything is welcome.
- **Accessibility** — keyboard navigation, screen reader labels, focus order.
- **Internationalization** — Vynl is English-only.

## Recognition

Contributors are credited in the release notes for changes they ship. The git history is the canonical record.

## License

By contributing, you agree your contributions will be licensed under the project's existing license (see [`LICENSE`](LICENSE)).

---

The fastest way to influence where Vynl goes is to open an **Idea** or join the **Discussions** — code contributions are welcome but the conversations shape what gets built next.
