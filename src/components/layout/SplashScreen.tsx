"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<"logo" | "text" | "exit">("logo");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("text"), 1200);
    const t2 = setTimeout(() => setPhase("exit"), 2400);
    const t3 = setTimeout(onComplete, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== "exit" ? (
        <motion.div
          key="splash"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]"
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {/* Glow backdrop */}
          <motion.div
            className="absolute rounded-full bg-purple-600/20 blur-[100px]"
            initial={{ width: 0, height: 0 }}
            animate={{ width: 400, height: 400 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />

          {/* DJ Dino logo */}
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 15,
              duration: 0.8,
            }}
          >
            <Image
              src="/logo-main.png"
              alt="Vynl DJ Dino"
              width={280}
              height={280}
              className="drop-shadow-[0_0_40px_rgba(168,85,247,0.4)]"
              priority
            />
          </motion.div>

          {/* VYNL text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={
              phase === "text"
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: 20 }
            }
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mt-4"
          >
            <Image
              src="/logo-header.png"
              alt="VYNL"
              width={200}
              height={48}
              className="h-12 w-auto drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]"
            />
          </motion.div>

          {/* Tagline */}
          <motion.p
            className="text-muted-foreground text-sm mt-3 tracking-widest uppercase"
            initial={{ opacity: 0 }}
            animate={phase === "text" ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            AI-Powered Music Discovery
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
