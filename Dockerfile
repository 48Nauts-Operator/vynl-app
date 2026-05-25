# ── Stage 1: Dependencies ─────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js in standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Production ──────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3101
ENV HOSTNAME="0.0.0.0"

# Install runtime dependencies: beets, ffmpeg, python3, chromaprint.
# libchromaprint-tools gives us the `fpcalc` binary for the
# Shazam-style track identification feature (see /api/tracks/[id]/identify
# audio mode). Adds ~5 MB to the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    libchromaprint-tools \
    && python3 -m venv /opt/vynl-venv \
    && /opt/vynl-venv/bin/pip install --no-cache-dir \
       beets requests pylast pillow musicbrainzngs pyacoustid \
       spotdl yt-dlp \
    && ln -s /opt/vynl-venv/bin/beet /usr/local/bin/beet \
    && ln -s /opt/vynl-venv/bin/spotdl /usr/local/bin/spotdl \
    && ln -s /opt/vynl-venv/bin/yt-dlp /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Note: Whisper + Fabric AI for podcast transcription/analysis are not
# included in the Docker image yet. This is planned for a future release.
# For now, podcast AI features require a native install.

# Create non-root user with a real home directory so beets/confuse can
# resolve $HOME/.config/beets instead of falling back to /nonexistent.
RUN addgroup --system --gid 1001 vynl \
    && adduser --system --uid 1001 --home /home/vynl --shell /bin/bash --ingroup vynl vynl \
    && mkdir -p /home/vynl/.config/beets \
    && chown -R vynl:vynl /home/vynl

ENV HOME=/home/vynl

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Beets DBs imported on macOS carry hardcoded /Volumes/Music paths.
# Pre-create compatibility symlinks pointing at the /music bind mount
# so those paths resolve at runtime. The targets don't need to exist
# at build time — Linux symlinks resolve on access.
RUN mkdir -p /Volumes \
    && ln -sfn /music /Volumes/Music \
    && ln -sfn /music /Volumes/Music-1

# Create directories for runtime data
RUN mkdir -p /app/data /app/public/covers \
    && chown -R vynl:vynl /app

USER vynl

EXPOSE 3101

CMD ["node", "server.js"]
