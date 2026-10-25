import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Recovery } from "./components/Recovery";
import { useStore } from "./store";
import { stopFocusZoomOnIOS } from "./lib/noFocusZoom";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles.css";

stopFocusZoomOnIOS();

// Expose the store in development so scripted checks can set up states.
if (import.meta.env.DEV) Object.assign(window, { __houseStore: useStore });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallback={(error, reset) => <Recovery error={error} onRetry={reset} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
