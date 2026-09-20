/* A menu button: a button that opens a short list of actions.
 *
 * The WAI-ARIA menu button pattern, and only as much of it as a list of four
 * items needs: the trigger says it has a menu and whether it is open; opening
 * puts the focus on the first item; arrows, Home and End move between items
 * and wrap; Escape closes and hands the focus back to the trigger; Tab, a
 * click elsewhere or choosing an item closes it.
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

/** Where a key moves the focus among `count` items from `index`, or null when it is not a moving key. */
export function menuMove(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function useMenu() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  /** Which item takes the focus on opening: the first, or the last when opened with ArrowUp. */
  const entry = useRef<"first" | "last">("first");

  const items = () => [...(popRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const list = items();
    (entry.current === "last" ? list.at(-1) : list[0])?.focus();
    // A press anywhere outside the trigger and the menu closes it; the press still does what it does.
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const triggerProps = {
    ref: triggerRef,
    type: "button" as const,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    onClick: () => {
      entry.current = "first";
      setOpen((o) => !o);
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      entry.current = e.key === "ArrowUp" ? "last" : "first";
      setOpen(true);
    },
  };

  const menuProps = {
    id,
    role: "menu" as const,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key === "Tab") {
        close();
        return;
      }
      const list = items();
      const next = menuMove(e.key, list.indexOf(document.activeElement as HTMLElement), list.length);
      if (next === null) return;
      e.preventDefault();
      list[next].focus();
    },
  };

  return { open, close, triggerProps, menuProps, popRef };
}
