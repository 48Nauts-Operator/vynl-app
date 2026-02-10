"use client";

import React, { useState } from "react";
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
  Music2,
  Disc3,
  Mic2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col bg-[#0a0a0a] border-r border-border transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[240px]"
      )}
    >
      <div className="flex items-center gap-2 px-4 py-5">
        <Music2 className="h-8 w-8 text-primary shrink-0" />
        {!collapsed && (
          <span className="text-xl font-bold tracking-tight">Tunify</span>
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
