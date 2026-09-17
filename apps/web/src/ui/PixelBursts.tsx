/* A small pixel burst wherever a primary button is pressed.
 *
 * One listener for the whole app rather than a wrapper around every button:
 * the burst is feedback, not behaviour, so no button should have to know about
 * it. The burst takes the button's own colour, draws nothing under reduced
 * motion, and removes itself when its animation ends.
 */

import { useEffect } from "react";

const BURSTING = ".btn.primary, .btn.play, .btn.neon";

export function PixelBursts() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const press = (e: PointerEvent) => {
      if (reduced.matches || !(e.target instanceof Element)) return;
      const button = e.target.closest<HTMLElement>(BURSTING);
      if (!button || button.matches(":disabled")) return;
      const burst = document.createElement("i");
      burst.className = "burst";
      burst.setAttribute("aria-hidden", "true");
      burst.style.left = `${e.clientX - 2}px`;
      burst.style.top = `${e.clientY - 2}px`;
      burst.style.setProperty("--burst", getComputedStyle(button).backgroundColor);
      burst.addEventListener("animationend", () => burst.remove(), { once: true });
      document.body.appendChild(burst);
    };
    document.addEventListener("pointerdown", press);
    return () => document.removeEventListener("pointerdown", press);
  }, []);
  return null;
}
