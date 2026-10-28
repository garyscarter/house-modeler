import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HOUSES } from "./houses";
import { activeHouseId, loadHouse } from "./lib/house";
import { HousePicker } from "./components/HousePicker";
import { Loader } from "./components/Loader";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles.css";

/**
 * The house is decided before anything else loads: the store reads it at import time to pick its saved project. With
 * no house chosen yet the picker asks; choosing one reloads the page. Otherwise the house loads, then the app.
 */
const id = activeHouseId();
const root = createRoot(document.getElementById("root")!);

function Opening({ name }: { name: string }) {
  return (
    <div className="house-opening" role="status">
      <Loader kind="blueprint" size={40} />
      <span>Opening {name}</span>
    </div>
  );
}

if (!id) {
  root.render(
    <StrictMode>
      <HousePicker />
    </StrictMode>,
  );
} else {
  const name = HOUSES[id]?.name ?? "the house";
  // The app, its store and its recovery screen load only once the house has.
  const App = lazy(async () => {
    await loadHouse(id);
    const [{ default: App }, { useStore }, { ErrorBoundary }, { Recovery }] = await Promise.all([
      import("./App"),
      import("./store"),
      import("./components/ErrorBoundary"),
      import("./components/Recovery"),
    ]);
    // Expose the store in development so scripted checks can set up states.
    if (import.meta.env.DEV) Object.assign(window, { __houseStore: useStore });
    return {
      default: () => (
        <ErrorBoundary fallback={(error, reset) => <Recovery error={error} onRetry={reset} />}>
          <App />
        </ErrorBoundary>
      ),
    };
  });
  root.render(
    <StrictMode>
      <Suspense fallback={<Opening name={name} />}>
        <App />
      </Suspense>
    </StrictMode>,
  );
}
