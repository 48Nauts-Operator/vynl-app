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

# Install runtime dependencies: beets, ffmpeg, python3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    && python3 -m venv /opt/vynl-venv \
    && /opt/vynl-venv/bin/pip install --no-cache-dir beets requests \
    && ln -s /opt/vynl-venv/bin/beet /usr/local/bin/beet \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Note: Whisper + Fabric AI for podcast transcription/analysis are not
# included in the Docker image yet. This is planned for a future release.
# For now, podcast AI features require a native install.

# Create non-root user
RUN addgroup --system --gid 1001 vynl \
    && adduser --system --uid 1001 vynl

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create directories for runtime data
RUN mkdir -p /app/data /app/public/covers \
    && chown -R vynl:vynl /app

USER vynl

EXPOSE 3101

CMD ["node", "server.js"]
