import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, ExternalLink, AlertTriangle } from "lucide-react";
import { getReleases } from "@/lib/github-stats";

export const revalidate = 300;
export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Render a small subset of Markdown — enough for release-note bodies
 * (headings, bold/italic, links, lists, inline code). Keeps Vynl
 * dependency-free; we don't need a full Markdown engine for this.
 */
function renderMarkdown(md: string): string {
  return md
    // Escape minimum HTML first.
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // ### / ## / # headings
    .replace(/^###\s+(.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^#\s+(.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
    // Bold / italic / inline code
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="text-xs bg-muted px-1 py-0.5 rounded">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-[#a855f7] underline">$1</a>')
    // List items (- or * at start of line)
    .replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li[\s\S]*?<\/li>)(\n(?!<li))/g, '<ul class="my-2 space-y-0.5">$1</ul>$2')
    // Paragraph breaks
    .replace(/\n{2,}/g, '</p><p class="my-2">')
    .replace(/^/, '<p class="my-2">')
    .replace(/$/, '</p>')
    // Single newlines inside a paragraph
    .replace(/(?<!>)\n(?!<)/g, "<br/>");
}

export default async function ReleasesPage() {
  const releases = await getReleases();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Package className="h-7 w-7" />
          Releases
        </h1>
        <p className="text-muted-foreground mt-1">
          Every version of Vynl, in order. Pulled live from{" "}
          <a
            href="https://github.com/48Nauts-Operator/vynl-app/releases"
            target="_blank"
            rel="noreferrer"
            className="underline text-[#a855f7]"
          >
            GitHub Releases
          </a>
          .
        </p>
      </div>

      {releases.length === 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-6 pb-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">No releases found.</p>
              <p className="text-muted-foreground mt-1">
                The GitHub API may be unreachable, or you hit the
                unauthenticated rate limit. Set{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  GH_STATS_PAT
                </code>{" "}
                in your env to lift it to 5,000 / hour.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {releases.map((r, idx) => (
          <Card
            key={r.tag_name}
            className={
              idx === 0
                ? "border-[#a855f7]/50 shadow-[0_0_30px_rgba(168,85,247,0.15)]"
                : ""
            }
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    {r.name || r.tag_name}
                    {idx === 0 && (
                      <Badge className="bg-[#a855f7]/20 text-[#f0abfc] border border-[#a855f7]/60">
                        Latest
                      </Badge>
                    )}
                    {r.prerelease && (
                      <Badge variant="outline" className="text-amber-300 border-amber-500/40">
                        Pre-release
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.tag_name} · {formatDate(r.published_at)}
                  </p>
                </div>
                <a
                  href={r.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  GitHub <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent>
              {r.body ? (
                <div
                  className="text-sm leading-relaxed [&_p]:my-2 [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(r.body) }}
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">No notes for this release.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
