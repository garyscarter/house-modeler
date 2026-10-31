import { lazy, Suspense, type ComponentProps } from "react";
import { Loader } from "./Loader";

/**
 * Electrics, Plot and Garden panels load the first time their mode is opened, so the Welcome screen and the first view
 * don't download them. Every place that shows one uses these wrappers, so they stay in a chunk of their own.
 */
const Electrics = lazy(() => import("./ElectricsPanel").then((m) => ({ default: m.ElectricsPanel })));
const Plot = lazy(() => import("./PlotPanel").then((m) => ({ default: m.PlotPanel })));
const Garden = lazy(() => import("./GardenPanel").then((m) => ({ default: m.GardenPanel })));

const Opening = ({ what }: { what: string }) => (
  <p className="muted small panel-loading">
    <Loader kind="lift" size={14} /> Opening {what}…
  </p>
);

export const ElectricsPanelLazy = (p: ComponentProps<typeof Electrics>) => (
  <Suspense fallback={<Opening what="Electrics" />}>
    <Electrics {...p} />
  </Suspense>
);
export const PlotPanelLazy = () => (
  <Suspense fallback={<Opening what="Plot" />}>
    <Plot />
  </Suspense>
);
export const GardenPanelLazy = () => (
  <Suspense fallback={<Opening what="Garden" />}>
    <Garden />
  </Suspense>
);
