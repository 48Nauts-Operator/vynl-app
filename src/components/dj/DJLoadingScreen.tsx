// [VynlDJ] — extractable: Loading animation while AI generates the set
"use client";

import React from "react";
import { motion } from "framer-motion";
import { Headphones } from "lucide-react";

export function DJLoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-8">
      {/* Animated headphones icon */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <Headphones className="h-24 w-24 text-primary" />
      </motion.div>

      {/* Pulsing text */}
      <div className="text-center space-y-3">
        <motion.h2
          className="text-2xl font-bold"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          DJ is building your set...
        </motion.h2>
        <p className="text-muted-foreground">
          Analyzing your library and curating the perfect flow
        </p>
      </div>

      {/* Animated equalizer bars */}
      <div className="flex items-end gap-1.5 h-12">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <motion.div
            key={i}
            className="w-2 bg-primary rounded-full"
            animate={{
              height: ["12px", `${20 + Math.random() * 28}px`, "12px"],
            }}
            transition={{
              duration: 0.8 + Math.random() * 0.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
