import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme } from "@/ui/theme";
// Themes first: every later layer only reads their tokens.
import "./ui/theme-arcade.css";
import "./ui/theme-clean.css";
import "./ui/base.css";
// The global layer, in cascade order: the shell, then what pages compose with.
// Primitives and features import their own sheets.
import "./ui/styles/shell.css";
import "./ui/styles/layout.css";
import "./ui/styles/controls.css";
import "./ui/styles/readouts.css";
import "./ui/styles/utilities.css";

applyTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
