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
  Disc3,
  Mic2,
  Info,
  Loader2,
  FolderInput,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/library", label: "Library", icon: Library },
  { href: "/albums", label: "Albums", icon: Disc3 },
  { href: "/artists", label: "Artists", icon: Mic2 },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/playlists", label: "Playlists", icon: ListMusic },
  { href: "/profile", label: "Taste Profile", icon: User },
  { href: "/speakers", label: "Speakers", icon: Speaker },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: Info },
];

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
  const isImporting = importJob.status === "running";
  const importProgress =
    isImporting && importJob.total
      ? Math.round(((importJob.current || 0) / importJob.total) * 100)
      : 0;

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
          {navItems.map((item) => {
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
