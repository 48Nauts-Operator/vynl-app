"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Library,
  Compass,
  ListMusic,
  User,
  Speaker,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Disc3,
  Mic2,
  Info,
  Loader2,
  FolderInput,
  PartyPopper,
  Podcast,
  Youtube,
  BarChart3,
  MicVocal,
  Headphones,
  Heart,
  Package,
  GitBranch,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useSettingsStore, type FeatureFlags } from "@/store/settings";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  featureKey?: keyof FeatureFlags;
}

interface NavGroup {
  group: string;            // section label
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).group !== undefined;
}

// Top-level flat items first, then collapsible sections at the bottom.
const navEntries: NavEntry[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/albums", label: "Albums", icon: Disc3 },
  { href: "/artists", label: "Artists", icon: Mic2 },
  { href: "/playlists", label: "Playlists", icon: ListMusic, featureKey: "playlists" },
  { href: "/podcasts", label: "Podcasts", icon: Podcast, featureKey: "podcasts" },
  {
    group: "Discovery",
    items: [
      { href: "/discover", label: "Discover", icon: Compass, featureKey: "discover" },
      { href: "/wishlist", label: "Wishlist", icon: Heart },
      { href: "/profile", label: "Taste Profile", icon: User, featureKey: "tasteProfile" },
      { href: "/youtube", label: "YouTube", icon: Youtube, featureKey: "youtube" },
    ],
  },
  {
    group: "Party",
    items: [
      { href: "/party", label: "AI DJ", icon: Headphones, featureKey: "partyMode" },
      { href: "/karaoke", label: "Karaoke", icon: MicVocal, featureKey: "partyMode" },
    ],
  },
  {
    group: "Admin & Housekeeping",
    items: [
      { href: "/library", label: "Library", icon: Library },
      { href: "/speakers", label: "Speakers", icon: Speaker },
      { href: "/stats", label: "Stats", icon: BarChart3 },
      { href: "/github-stats", label: "Repo Stats", icon: GitBranch },
      { href: "/releases", label: "Releases", icon: Package },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/about", label: "About", icon: Info },
    ],
  },
];

const SECTION_STATE_KEY = "vynl:sidebar:sections";

interface ImportJobStatus {
  status: "idle" | "running" | "complete" | "error";
  total?: number;
  current?: number;
  currentFolder?: string;
  succeeded?: number;
  failed?: number;
  postProcessing?: boolean;
}

function useImportStatus() {
  const [job, setJob] = useState<ImportJobStatus>({ status: "idle" });

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/library/import/batch");
        const data = await res.json();
        if (active) setJob(data);
      } catch {
        // ignore
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return job;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const importJob = useImportStatus();
  const features = useSettingsStore((s) => s.features);
  const isImporting = importJob.status === "running";
  const importProgress =
    isImporting && importJob.total
      ? Math.round(((importJob.current || 0) / importJob.total) * 100)
      : 0;

  // Collapsible section state, persisted in localStorage so the
  // sidebar layout survives page navigation. Default: both sections
  // open on first load.
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    Discovery: true,
    Party: true,
    "Admin & Housekeeping": true,
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SECTION_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setSectionsOpen((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  const toggleSection = (key: string) => {
    setSectionsOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Feature-flag filter applied uniformly to flat items and section
  // contents; sections with zero visible items render no header.
  const filterByFlags = (item: NavItem) =>
    !item.featureKey || features[item.featureKey];

  const visibleEntries: NavEntry[] = navEntries
    .map((e) => {
      if (isGroup(e)) {
        const items = e.items.filter(filterByFlags);
        return items.length > 0 ? { ...e, items } : null;
      }
      return filterByFlags(e) ? e : null;
    })
    .filter((e): e is NavEntry => e !== null);

  return (
    <div
      className={cn(
        "flex flex-col bg-[#0a0a0a] border-r border-border transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[240px]"
      )}
    >
      <div className="flex items-center justify-center px-2 py-5">
        {collapsed ? (
          <Disc3 className="h-8 w-8 text-primary shrink-0" />
        ) : (
          <Image
            src="/logo-header.png"
            alt="Vynl"
            width={240}
            height={56}
            className="h-14 w-auto"
            priority
          />
        )}
      </div>

      <Separator className="mx-2" />

      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-1">
          {visibleEntries.map((entry, idx) => {
            if (isGroup(entry)) {
              const isOpen = sectionsOpen[entry.group] ?? true;
              return (
                <div key={`group-${entry.group}-${idx}`} className="mt-2">
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={() => toggleSection(entry.group)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                      aria-expanded={isOpen}
                    >
                      <span>{entry.group}</span>
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-transform",
                          isOpen ? "rotate-0" : "-rotate-90"
                        )}
                      />
                    </button>
                  )}
                  {(collapsed || isOpen) && entry.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href));
                    return (
                      <Link key={item.href} href={item.href}>
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start gap-3 h-10",
                            collapsed && "justify-center px-2",
                            isActive &&
                              "bg-secondary text-primary hover:bg-secondary hover:text-primary"
                          )}
                        >
                          <item.icon className="h-5 w-5 shrink-0" />
                          {!collapsed && (
                            <span className="truncate">{item.label}</span>
                          )}
                        </Button>
                      </Link>
                    );
                  })}
                </div>
              );
            }

            const isActive =
              pathname === entry.href ||
              (entry.href !== "/" && pathname.startsWith(entry.href));
            return (
              <Link key={entry.href} href={entry.href}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-3 h-10",
                    collapsed && "justify-center px-2",
                    isActive &&
                      "bg-secondary text-primary hover:bg-secondary hover:text-primary"
                  )}
                >
                  <entry.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && (
                    <span className="truncate">{entry.label}</span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Global import status indicator */}
      {isImporting && (
        <>
          <Separator className="mx-2" />
          <Link href="/library">
            <div className="px-3 py-3 cursor-pointer hover:bg-secondary/30 transition-colors">
              {collapsed ? (
                <Loader2 className="h-5 w-5 text-primary animate-spin mx-auto" />
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <FolderInput className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-xs font-medium truncate">
                      {importJob.postProcessing
                        ? "Post-processing..."
                        : `Importing ${importJob.current}/${importJob.total}`}
                    </span>
                  </div>
                  <Progress value={importProgress} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground truncate">
                    {importJob.currentFolder}
                  </p>
                </div>
              )}
            </div>
          </Link>
        </>
      )}

      <Separator className="mx-2" />

      <div className="p-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-full h-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
