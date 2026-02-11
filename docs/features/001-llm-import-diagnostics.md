# Feature: LLM-Powered Import Diagnostics

**Status:** Planned
**Priority:** High
**Label:** Pro Feature
**Created:** 2026-02-11

## Summary

Add AI-powered diagnostics to the batch import system. When imports fail, users can click "Investigate" to have an LLM analyze the error, system config, and file context to produce actionable fix instructions.

## Problem

Import failures are opaque. Beets outputs cryptic errors like "Skipping" or "unreadable file" without explaining *why*. Users must manually cross-reference:
- Beets configuration (paths, plugins, duplicate settings)
- NAS mount status and permissions
- File formats and metadata quality
- Previous import history

This requires deep knowledge of beets internals and the local system setup.

## Solution

### Phase 1: Investigate & Diagnose

An "Investigate" button appears on failed imports. Clicking it sends structured context to the LLM and displays an inline diagnostic panel.

**Context sent to LLM:**
1. Error output for the specific folder
2. Beets config (`~/.config/beets/config.yaml`)
3. Folder file listing (names, formats, sizes, count)
4. NAS mount status (`mount | grep -i music`)
5. Environment paths (library path, DB path, remap config)
6. Previous results from the same batch (successes vs failures for comparison)
7. Audio file metadata sample (first file's tags via `music-metadata`)

**LLM classifies the issue as one of:**
| Classification | Example | Action |
|---|---|---|
| Config Issue | Wrong paths, NAS unmounted, missing plugins | Show fix steps |
| File Issue | Corrupt audio, unsupported format, permissions | Identify bad files |
| Duplicate | Already in library, beets skipping | Suggest cleanup or force-import |
| Metadata Issue | Missing/bad tags preventing auto-tag | Suggest manual tagging |
| Bug | Unexpected behavior in Vynl/beets | Offer to file GitHub issue |

**Diagnostic output includes:**
- Root cause (1-2 sentences)
- Classification badge
- Step-by-step fix instructions
- Affected files list
- Confidence level

### Phase 2: Auto-Issue Filing

When the LLM identifies a potential **bug** (not a config/user issue):
- Draft a GitHub issue with reproduction steps
- Include sanitized system context (no API keys)
- User reviews and approves before filing
- Issue is created via GitHub API on `48Nauts-Operator/tunify`

### Phase 3: Self-Healing (Future)

For known fixable issues (e.g., permissions, config typos):
- LLM suggests a specific fix
- User approves the fix with one click
- System applies the fix and retries the import

## Technical Design

### API Endpoint

```
POST /api/library/import/investigate
```

**Request:**
```json
{
  "folder": "Back To The Old Skool",
  "error": "... full error output ...",
  "logs": ["... relevant log lines ..."]
}
```

**Response:**
```json
{
  "classification": "duplicate",
  "confidence": 0.95,
  "summary": "These tracks are already in your beets library. Beets is configured with duplicate_action: skip.",
  "details": "The album 'Back To The Old Skool' was previously imported. 8 tracks have both .m4a and .mp3 versions in the source folder, which beets treats as duplicates.",
  "steps": [
    "The album already exists in /Volumes/Music/library/. No action needed.",
    "To clean up the source folder: delete /Volumes/Music/downloads/Back To The Old Skool/",
    "To force re-import: temporarily set duplicate_action to 'merge' in beets config"
  ],
  "affectedFiles": ["1-16 Connected.m4a", "1-16 Connected.mp3", "..."],
  "isBug": false
}
```

### System Prompt (Draft)

```
You are a music library diagnostic assistant for Vynl, a self-hosted music management app built on Beets.

Analyze the following import failure and provide a diagnosis.

CONTEXT:
- Beets config: {config}
- NAS mounts: {mounts}
- Environment: BEETS_DB_PATH={db_path}, MUSIC_LIBRARY_PATH={lib_path}
- Path remap: {remap}

FAILED IMPORT:
- Folder: {folder_name}
- File count: {count} audio files ({formats})
- Error output: {error}
- Full log: {logs}

BATCH CONTEXT:
- {succeeded} folders succeeded, {failed} failed in this batch
- Successful folders had: {success_patterns}

INSTRUCTIONS:
1. Classify the issue: config_issue | file_issue | duplicate | metadata_issue | bug
2. Explain the root cause in plain language
3. Provide specific fix steps (reference actual paths and config values)
4. List affected files if applicable
5. Rate your confidence (0.0-1.0)
6. If this appears to be a software bug (not user config), set isBug: true

Respond in JSON format.
```

### Pro Feature Gating

- Check: `ANTHROPIC_API_KEY` is set in environment/settings
- UI: "Investigate" button shows lock icon for free users with tooltip "Available in Vynl Pro"
- Fallback: without API key, button links to settings page to configure

### UI Components

```
Failed folder row:
[X] Back To The Old Skool          show error  [Investigate]
    |
    v (expanded diagnostic panel)
    +--------------------------------------------------+
    | DUPLICATE                              95% conf   |
    |                                                   |
    | These tracks already exist in your library.       |
    | Beets skipped them (duplicate_action: skip).      |
    |                                                   |
    | Fix:                                              |
    | 1. Album exists in /Volumes/Music/library/...     |
    | 2. Delete source: /Volumes/Music/downloads/...    |
    |                                                   |
    | 8 affected files                    [File Issue?] |
    +--------------------------------------------------+
```

## Dependencies

- Anthropic SDK (`@anthropic-ai/sdk`) — already in project for AI features
- Beets config reader — read and parse YAML
- GitHub API (`gh` CLI or `octokit`) — for Phase 2 issue filing

## Metrics

- % of investigated errors that lead to successful re-import
- Classification accuracy (user feedback: "Was this helpful?")
- Most common error categories (informs UX improvements)

## Open Questions

- [ ] Should investigation results be cached/persisted?
- [ ] Rate limiting on LLM calls (cost control)?
- [ ] Should we batch-investigate all failures at once or one at a time?
- [ ] Privacy: what system info is safe to include in GitHub issues?
