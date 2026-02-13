"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Sidebar } from "./Sidebar";
import { SplashScreen } from "./SplashScreen";
import { TooltipProvider } from "@/components/ui/tooltip";

const PlayerBar = dynamic(
  () => import("@/components/player/PlayerBar").then((m) => m.PlayerBar),
  { ssr: false }
);

const GlobalImportStatus = dynamic(
  () => import("./GlobalImportStatus").then((m) => m.GlobalImportStatus),
  { ssr: false }
);

export function AppShell({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !sessionStorage.getItem("vynl-splash-shown")) {
      setShowSplash(true);
    }
  }, []);

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem("vynl-splash-shown", "1");
    setShowSplash(false);
  }, []);

  return (
    <TooltipProvider>
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-background p-6">
            {children}
          </main>
        </div>
        <PlayerBar />
        <GlobalImportStatus />
      </div>
    </TooltipProvider>
  );
}
