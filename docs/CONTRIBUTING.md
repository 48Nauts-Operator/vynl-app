# Contributing to Vynl

## Getting Started

1. Fork the repo: `gh repo fork 48Nauts-Operator/vynl-app`
2. Clone your fork: `git clone git@github.com:<your-user>/tunify.git`
3. Install dependencies: `npm install`
4. Copy env: `cp .env.example .env.local` and configure paths
5. Run dev server: `npm run dev`

## Development Workflow

### Branch Naming

```
feat/<short-description>    # New features
fix/<short-description>     # Bug fixes
docs/<short-description>    # Documentation only
refactor/<short-description> # Code restructuring
```

### Creating a Pull Request

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature main
   ```

2. Make your changes, commit with conventional commits:
   ```bash
   git commit -m "feat: Add awesome feature"
   git commit -m "fix: Resolve import timeout on large albums"
   ```

3. Push and create PR:
   ```bash
   git push -u origin feat/my-feature
   gh pr create --title "feat: Add awesome feature" --body "$(cat <<'EOF'
   ## Summary
   - What this PR does

   ## Test plan
   - [ ] Tested locally with batch import
   - [ ] Verified on NAS mount
   EOF
   )"
   ```

4. Or use Claude Code:
   ```
   /commit        # Auto-commit with conventional message
   ```
   Then ask Claude to create the PR.

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: Add YouTube download support
fix: Resolve NAS mount detection on macOS
docs: Update feature roadmap
refactor: Extract beets adapter into separate module
chore: Update dependencies
```

### PR Requirements

- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] No new ESLint warnings
- [ ] Feature flags for new optional features
- [ ] Update `docs/features/README.md` if adding a planned feature
- [ ] Test on NAS-mounted library (SMB/AFP)

## Architecture Overview

```
src/
  app/                    # Next.js App Router pages & API routes
    api/library/          # Library management APIs
    api/library/import/   # Import (single + batch)
  components/
    layout/Sidebar.tsx    # Navigation sidebar (reads feature flags)
    ui/                   # Shared UI components (shadcn/ui style)
  store/
    player.ts             # Zustand: playback state
    settings.ts           # Zustand: feature flags & app config
  lib/
    db/                   # SQLite database (better-sqlite3)
    adapters/             # Beets & filesystem adapters
```

### Key Patterns

- **Feature flags**: Add to `src/store/settings.ts`, gate sidebar in `Sidebar.tsx`
- **API routes**: Next.js App Router in `src/app/api/`
- **Background jobs**: Fire-and-forget with in-memory state + polling
- **NAS awareness**: Always check mount status before file operations

## Filing Issues

### Bug Reports

Include:
- Steps to reproduce
- Expected vs actual behavior
- Beets config (sanitize API keys)
- NAS type (SMB/AFP) and mount path
- Error logs (use the copy button in the import log panel)

### Feature Requests

Reference or create a spec in `docs/features/` with:
- Problem statement
- Proposed solution
- Technical design
- Open questions

## Auto-Generated Issues (LLM Diagnostics)

When Vynl's LLM diagnostics identifies a potential bug (see [001-llm-import-diagnostics.md](features/001-llm-import-diagnostics.md)):

1. The system drafts a GitHub issue with sanitized context
2. User reviews and approves before submission
3. Issue is tagged with `auto-diagnosed` label
4. Include the diagnostic classification and confidence score

Template for auto-generated issues:
```markdown
## Auto-Diagnosed Issue

**Classification:** bug
**Confidence:** 0.92
**Diagnosed by:** Vynl LLM Diagnostics v1

### Context
- Beets version: X.X
- Vynl version: X.X
- NAS: SMB/AFP
- Import type: batch

### Error
[sanitized error output]

### LLM Analysis
[diagnostic summary]

### Reproduction Steps
[auto-generated from context]
```
