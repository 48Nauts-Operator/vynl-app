"use client";

import React from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";

export default function AboutPage() {
  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.12 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="max-w-xl mx-auto py-8 space-y-8"
    >
      {/* Logo + Brand */}
      <motion.div variants={item} className="flex flex-col items-center text-center">
        <Image
          src="/logo-main.png"
          alt="Vynl DJ Dino"
          width={220}
          height={220}
          className="drop-shadow-[0_0_30px_rgba(168,85,247,0.35)]"
          priority
        />
        <Image
          src="/logo-header.png"
          alt="VYNL"
          width={180}
          height={44}
          className="mt-4 h-11 w-auto"
        />
        <p className="text-muted-foreground text-sm mt-2 tracking-widest uppercase">
          AI-Powered Music Discovery & Playback
        </p>
      </motion.div>

      {/* Version */}
      <motion.div variants={item}>
        <Card>
          <CardContent className="py-5 space-y-3">
            <Row label="Version" value="0.1.0" />
            <Separator />
            <Row label="Build" value="Next.js 15 + React 19" />
            <Separator />
            <Row label="Engine" value="Beets + SQLite + Sonos" />
          </CardContent>
        </Card>
      </motion.div>

      {/* Credits */}
      <motion.div variants={item}>
        <Card>
          <CardContent className="py-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Credits
            </h3>
            <Separator />
            <Row label="Design & Development" value="Andre Wolke" />
            <Separator />
            <Row label="Logo & Branding" value="Jarvis (Andre's AI)" />
            <Separator />
            <Row label="AI Assistant" value="Claude (Anthropic)" />
          </CardContent>
        </Card>
      </motion.div>

      {/* Legal */}
      <motion.div variants={item} className="text-center space-y-2">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Vynl. All rights reserved.
        </p>
        <p className="text-xs text-muted-foreground/60">
          Made with love, beats, and a DJ dinosaur.
        </p>
      </motion.div>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
