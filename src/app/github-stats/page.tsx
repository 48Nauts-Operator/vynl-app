import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  Eye,
  GitFork,
  Download,
  Package,
  ExternalLink,
  AlertTriangle,
  Github,
  GitBranch,
  Activity,
} from "lucide-react";
import { getAggregatedStats, type TrafficSeries } from "@/lib/github-stats";

export const revalidate = 300;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return `${Math.floor(months / 12)} year${months >= 24 ? "s" : ""} ago`;
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-3xl font-semibold mt-1 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrafficBars({
  series,
  field,
  accent,
}: {
  series: TrafficSeries | null;
  field: "views" | "clones";
  accent: string;
}) {
  if (!series) return null;
  const points = (field === "views" ? series.views : series.clones) ?? [];
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No {field} recorded in the last 14 days.
      </p>
    );
  }
  const max = Math.max(...points.map((p) => p.count), 1);

  return (
    <div className="flex items-end gap-1 h-32 mt-3">
      {points.map((p) => {
        const heightPct = Math.max(2, (p.count / max) * 100);
        const dateLabel = new Date(p.timestamp).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        return (
          <div
            key={p.timestamp}
            className="flex-1 flex flex-col items-center justify-end h-full"
            title={`${dateLabel}: ${p.count} ${field} (${p.uniques} unique)`}
          >
            <div
              className={`w-full rounded-t ${accent}`}
              style={{ height: `${heightPct}%` }}
            />
            <span className="text-[9px] text-muted-foreground mt-1">
              {dateLabel.split(" ")[1]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default async function GithubStatsPage() {
  const stats = await getAggregatedStats();
  const { repo, releases, traffic, totals, hasPat, fetchedAt, dockerHub } = stats;

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6 px-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Repo Stats
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activity for{" "}
            {repo ? (
              <a
                href={repo.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                {repo.full_name}
              </a>
            ) : (
              "48Nauts-Operator/vynl-app"
            )}
          </p>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <p>Last refreshed: {new Date(fetchedAt).toLocaleTimeString()}</p>
          <p>Cached for 5 min</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Star className="h-5 w-5" />}
          label="Stars"
          value={repo?.stargazers_count ?? "—"}
          sub={repo ? `${repo.watchers_count} watchers` : undefined}
        />
        <StatTile
          icon={<GitFork className="h-5 w-5" />}
          label="Forks"
          value={repo?.forks_count ?? "—"}
        />
        <StatTile
          icon={<Download className="h-5 w-5" />}
          label={dockerHub ? "Docker Hub Pulls" : "Releases"}
          value={
            dockerHub
              ? dockerHub.pullCount.toLocaleString()
              : totals.releases.toLocaleString()
          }
          sub={
            dockerHub
              ? `${dockerHub.imageName} · ${dockerHub.starCount.toLocaleString()} stars`
              : "Set DOCKERHUB_IMAGE to surface adoption metric"
          }
        />
        <StatTile
          icon={<Package className="h-5 w-5" />}
          label="Latest Release"
          value={releases[0]?.tag_name ?? "—"}
          sub={releases[0] ? relativeTime(releases[0].published_at) : undefined}
        />
      </div>

      {!repo && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-6 pb-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Could not reach the GitHub API.</p>
              <p className="text-muted-foreground mt-1">
                The repo may be temporarily unreachable, or you hit the
                unauthenticated rate limit (60 req/h). Setting{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  GH_STATS_PAT
                </code>{" "}
                raises that to 5,000.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {hasPat ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Traffic (last 14 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-sm font-medium">Views</p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {traffic.views?.count ?? 0} total ·{" "}
                  {traffic.views?.uniques ?? 0} unique
                </p>
              </div>
              <TrafficBars
                series={traffic.views}
                field="views"
                accent="bg-cyan-500/80"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-sm font-medium flex items-center gap-1">
                  <GitBranch className="h-3.5 w-3.5" />
                  Clones
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {traffic.clones?.count ?? 0} total ·{" "}
                  {traffic.clones?.uniques ?? 0} unique
                </p>
              </div>
              <TrafficBars
                series={traffic.clones}
                field="clones"
                accent="bg-fuchsia-500/80"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              GitHub only retains 14 days of traffic data. For longer history,
              snapshot this endpoint daily.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-6 flex items-start gap-3">
            <Eye className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Traffic data is hidden.</p>
              <p className="text-muted-foreground mt-1">
                Views/clones from the Traffic API require a PAT with{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  Administration: read
                </code>{" "}
                on the repo. Set{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  GH_STATS_PAT
                </code>{" "}
                in the Vynl container env to unlock it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5" />
            Release Downloads
          </CardTitle>
        </CardHeader>
        <CardContent>
          {releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No releases yet.</p>
          ) : (
            <div className="space-y-4">
              {releases.map((r) => {
                const releaseDownloads = r.assets.reduce(
                  (sum, a) => sum + a.download_count,
                  0
                );
                return (
                  <div
                    key={r.tag_name}
                    className="border border-border rounded-lg p-3"
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-medium truncate">
                          {r.name || r.tag_name}
                        </h3>
                        {r.prerelease && (
                          <Badge variant="secondary" className="text-[10px]">
                            pre
                          </Badge>
                        )}
                        {r.draft && (
                          <Badge variant="outline" className="text-[10px]">
                            draft
                          </Badge>
                        )}
                        <a
                          href={r.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          title="Open on GitHub"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {releaseDownloads.toLocaleString()} download
                          {releaseDownloads === 1 ? "" : "s"}
                        </span>
                        <span>{formatDate(r.published_at)}</span>
                      </div>
                    </div>
                    {r.assets.length === 0 ? (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        No downloadable assets. Image is on GHCR — pulls
                        aren&apos;t counted by GitHub.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {r.assets.map((a) => (
                          <div
                            key={a.name}
                            className="flex items-center justify-between text-xs"
                          >
                            <a
                              href={a.browser_download_url}
                              className="truncate hover:underline font-mono"
                            >
                              {a.name}
                            </a>
                            <div className="flex items-center gap-3 text-muted-foreground tabular-nums shrink-0">
                              <span>{formatBytes(a.size)}</span>
                              <span className="font-semibold text-foreground">
                                {a.download_count.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground pt-2">
        <Link
          href={repo?.html_url ?? "https://github.com/48Nauts-Operator/vynl-app"}
          target="_blank"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <Github className="h-3 w-3" />
          View repo on GitHub
        </Link>
      </div>
    </div>
  );
}
