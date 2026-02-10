"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Sidebar } from "./Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const PlayerBar = dynamic(
  () => import("@/components/player/PlayerBar").then((m) => m.PlayerBar),
  { ssr: false }
);

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-background p-6">
            {children}
          </main>
        </div>
        <PlayerBar />
      </div>
    </TooltipProvider>
  );
}
