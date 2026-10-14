import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useStore } from "./store";
import "./styles.css";

// Expose the store in development so scripted checks can set up states.
if (import.meta.env.DEV) Object.assign(window, { __houseStore: useStore });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
