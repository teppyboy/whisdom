import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

// Inside the Whisdom Companion the native title bar overlays the page
// (titleBarStyle: Overlay); CSS uses this to inset the app header below
// the traffic lights and make it the window drag region.
if ("__TAURI_INTERNALS__" in window) {
  document.documentElement.dataset.tauri = "true"
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
