"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";

export function ConfettiCelebration() {
  useEffect(() => {
    const celebrateWithSideCannons = () => {
      const end = Date.now() + 1 * 1000; // 1 second
      const colors = ["#9ddcdd", "#077b91"]; // MintPass project colors
      let animationId: number | null = null;

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

        animationId = requestAnimationFrame(frame);
      };

      frame();

      // Return cleanup function
      return () => {
        if (animationId !== null) cancelAnimationFrame(animationId);
      };
    };

    // Start celebration and get cleanup function
    const cleanup = celebrateWithSideCannons();
    
    // Return cleanup to useEffect
    return cleanup;
  }, []);

  return null; // This component just triggers effects
}
