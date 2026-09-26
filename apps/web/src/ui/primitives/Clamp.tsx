/* Prose clamped to two lines, with a button to read the rest when there is more. */

import { useState } from "react";

import "./clamp.css";

export function Clamp({ text, limit = 150 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return (
    <>
      <p className={`clamp${long && !open ? " shut" : ""}`}>{text}</p>
      {long && (
        <button type="button" className="linkbutton" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Less" : "More"}
        </button>
      )}
    </>
  );
}
