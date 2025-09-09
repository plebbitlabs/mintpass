"use client";

import { Moon, SunDim } from "lucide-react";
import { useRef } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type props = {
  className?: string;
};

export const AnimatedThemeToggler = ({ className }: props) => {
  const { setTheme, resolvedTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  
  const changeTheme = async () => {
    if (!buttonRef.current) return;

    const newTheme = resolvedTheme === "dark" ? "light" : "dark";

    // Check if browser supports view transitions
    if (!document.startViewTransition) {
      setTheme(newTheme);
      return;
    }

    await document.startViewTransition(() => {
      flushSync(() => {
        setTheme(newTheme);
      });
    }).ready;

    const { top, left, width, height } =
      buttonRef.current.getBoundingClientRect();
    const y = top + height / 2;
    const x = left + width / 2;

    const right = window.innerWidth - left;
    const bottom = window.innerHeight - top;
    const maxRad = Math.hypot(Math.max(left, right), Math.max(top, bottom));

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${maxRad}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 700,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  };
  
  // Show loading state until theme is mounted
  if (!resolvedTheme) {
    return (
      <button className={cn("p-2", className)}>
        <SunDim className="h-[1.2rem] w-[1.2rem]" />
      </button>
    );
  }

  return (
    <button 
      ref={buttonRef} 
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
