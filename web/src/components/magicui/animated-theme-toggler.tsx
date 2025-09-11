"use client";

import { Moon, SunDim } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type props = {
  className?: string;
};

export const AnimatedThemeToggler = ({ className }: props) => {
  const { setTheme, resolvedTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Wait for hydration to complete before showing theme-specific content
  useEffect(() => {
    setMounted(true);
  }, []);
  
  const changeTheme = async () => {
    if (!buttonRef.current) return;

    const newTheme = resolvedTheme === "dark" ? "light" : "dark";

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    // Check if browser supports view transitions with proper feature detection
    if (prefersReducedMotion || typeof document.startViewTransition !== 'function') {
      setTheme(newTheme);
      return;
    }

    try {
      await document.startViewTransition(() => {
        flushSync(() => {
          setTheme(newTheme);
        });
      }).ready;
    } catch (err) {
      // Fallback if View Transitions fails/rejects
      console.warn('startViewTransition failed; falling back to direct theme set', err);
      flushSync(() => {
        setTheme(newTheme);
      });
    }

    // Guard against unmounts or ref becoming null after async boundary
    const buttonEl = buttonRef.current;
    if (!buttonEl || !buttonEl.isConnected || !document.documentElement) return;

    const { top, left, width, height } = buttonEl.getBoundingClientRect();
    
    // Calculate center coordinates
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    // Calculate maximum distances from center to viewport edges
    const dx = Math.max(centerX, window.innerWidth - centerX);
    const dy = Math.max(centerY, window.innerHeight - centerY);
    const maxRad = Math.hypot(dx, dy);

    // As a final guard, wrap animate in try/catch to avoid runtime errors
    try {
      document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${centerX}px ${centerY}px)`,
          `circle(${maxRad}px at ${centerX}px ${centerY}px)`,
        ],
      },
      {
        duration: 700,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      },
      );
    } catch (e) {
      // no-op: animation is best-effort
    }
  };
  
  // Show consistent loading state until hydration is complete
  if (!mounted) {
    return (
      <button 
        type="button"
        className={cn("p-2 rounded-md border hover:bg-accent transition-colors", className)}
      >
        <SunDim className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">Toggle theme</span>
      </button>
    );
  }

  return (
    <button 
      ref={buttonRef} 
      type="button"
      onClick={changeTheme} 
      className={cn("p-2 rounded-md border hover:bg-accent transition-colors", className)}
    >
      {resolvedTheme === "dark" ? (
        <SunDim className="h-[1.2rem] w-[1.2rem]" />
      ) : (
        <Moon className="h-[1.2rem] w-[1.2rem]" />
      )}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
};
