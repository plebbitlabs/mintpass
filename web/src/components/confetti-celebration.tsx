"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";

export function ConfettiCelebration() {
  useEffect(() => {
    const celebrateWithSideCannons = () => {
      const end = Date.now() + 3 * 1000; // 3 seconds
      const colors = ["#9ddcdd", "#077b91"]; // MintPass project colors

      const frame = () => {
        if (Date.now() > end) return;

        confetti({
          particleCount: 2,
          angle: 60,
          spread: 55,
          startVelocity: 60,
          origin: { x: 0, y: 0.5 },
          colors: colors,
        });
        confetti({
          particleCount: 2,
          angle: 120,
          spread: 55,
          startVelocity: 60,
          origin: { x: 1, y: 0.5 },
          colors: colors,
        });

        requestAnimationFrame(frame);
      };

      frame();
    };

    // Start celebration immediately when component mounts
    celebrateWithSideCannons();
  }, []);

  return null; // This component just triggers effects
}
