// Read-side helpers for the /stats page.
// All GitHub API calls cache for 5 minutes via Next's fetch revalidate option
// to stay well under the unauthenticated rate limit (60/hour). When a PAT is
// configured via GH_STATS_PAT, calls go to 5000/hour and unlock the Traffic API
// endpoints (views/clones), which require auth.

const REPO_OWNER = "48Nauts-Operator";
const REPO_NAME = "vynl-app";
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const REVALIDATE_SECONDS = 300;

export interface RepoInfo {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  default_branch: string;
}

export interface ReleaseAsset {
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  created_at: string;
}

export interface Release {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  body: string | null;
  assets: ReleaseAsset[];
}

export interface TrafficPoint {
  timestamp: string;
  count: number;
  uniques: number;
}

export interface TrafficSeries {
  count: number;
  uniques: number;
  views?: TrafficPoint[];
  clones?: TrafficPoint[];
}

function authHeaders(): HeadersInit {
  const pat = process.env.GH_STATS_PAT;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (pat) headers.Authorization = `Bearer ${pat}`;
  return headers;
}

async function ghFetch<T>(path: string, requireAuth = false): Promise<T | null> {
  if (requireAuth && !process.env.GH_STATS_PAT) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: authHeaders(),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function hasPat(): boolean {
  return Boolean(process.env.GH_STATS_PAT);
}

export function getRepoInfo(): Promise<RepoInfo | null> {
  return ghFetch<RepoInfo>("");
}

export async function getReleases(): Promise<Release[]> {
  const data = await ghFetch<Release[]>("/releases?per_page=20");
  return data ?? [];
}

export function getTrafficViews(): Promise<TrafficSeries | null> {
  return ghFetch<TrafficSeries>("/traffic/views", true);
}

export function getTrafficClones(): Promise<TrafficSeries | null> {
  return ghFetch<TrafficSeries>("/traffic/clones", true);
}

/**
 * Docker Hub pull count for the optional mirrored image. GHCR doesn't
 * expose pulls publicly; Docker Hub does, so when we mirror the image
 * there we get a real adoption number. Set DOCKERHUB_IMAGE env var
 * to e.g. "48nauts/vynl-app" to enable. Returns null when unset or
 * the API call fails.
 */
export interface DockerHubStats {
  imageName: string;
  pullCount: number;
  starCount: number;
  lastUpdated: string | null;
}

export async function getDockerHubStats(): Promise<DockerHubStats | null> {
  const image = process.env.DOCKERHUB_IMAGE;
  if (!image) return null;
  try {
    const res = await fetch(
      `https://hub.docker.com/v2/repositories/${image}/`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      imageName: image,
      pullCount: data.pull_count ?? 0,
      starCount: data.star_count ?? 0,
      lastUpdated: data.last_updated ?? null,
    };
  } catch {
    return null;
  }
}

// Aggregate helpers consumed by the /api/github-stats route.
export interface AggregatedStats {
  repo: RepoInfo | null;
  releases: Release[];
  traffic: {
    views: TrafficSeries | null;
    clones: TrafficSeries | null;
  };
  dockerHub: DockerHubStats | null;
  totals: {
    releases: number;
  };
  hasPat: boolean;
  fetchedAt: string;
}

export async function getAggregatedStats(): Promise<AggregatedStats> {
  const [repo, releases, views, clones, dockerHub] = await Promise.all([
    getRepoInfo(),
    getReleases(),
    getTrafficViews(),
    getTrafficClones(),
    getDockerHubStats(),
  ]);

  return {
    repo,
    releases,
    traffic: { views, clones },
    dockerHub,
    totals: {
      releases: releases.length,
    },
    hasPat: hasPat(),
    fetchedAt: new Date().toISOString(),
  };
}
