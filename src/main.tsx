import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isNative, initNativeApp } from "./lib/native";

// Native app: the APK bundles its own assets, so the PWA service worker is
// neither needed nor wanted (it would double-cache). Style the shell instead.
if (isNative) {
  initNativeApp();
} else if ("serviceWorker" in navigator) {
  // Web: auto-reload once when a freshly deployed service worker takes control,
  // so a new version is picked up automatically without clearing cache.
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
