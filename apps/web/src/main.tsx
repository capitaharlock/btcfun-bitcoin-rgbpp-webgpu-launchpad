import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme } from "./ui/theme";
// Themes first: every later layer only reads their tokens.
import "./ui/theme-arcade.css";
import "./ui/theme-clean.css";
import "./ui/base.css";
import "./ui/components.css";
import "./ui/surfaces.css";

applyTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
