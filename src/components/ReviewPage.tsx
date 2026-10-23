import { lazy, Suspense, useEffect } from "react";
import { useStore } from "../store";
import { Loader } from "./Loader";
import { openReview, type ReviewSection } from "./reviewState";
import "./ReviewPage.css";

/** The page itself (report, planning check, sunlight, exports) loads the first time Review opens. */
const ReviewDocument = lazy(() => import("./ReviewDocument"));

/** Opens Review on request and shows it while Review is the mode. */
export function ReviewPage() {
  const open = useStore((s) => s.mode === "review" && !!s.variants[s.activeVariant]);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const section = (e as CustomEvent<{ section?: ReviewSection } | undefined>).detail?.section;
      openReview(section === "report" || section === "planning" ? section : undefined);
    };
    window.addEventListener("house:open-review", onEvent);
    return () => window.removeEventListener("house:open-review", onEvent);
  }, []);

  if (!open) return null;
  return (
    <Suspense
      fallback={
        <div className="review-page review-loading" role="status">
          <Loader kind="blueprint" size={40} />
          Opening the review
        </div>
      }
    >
      <ReviewDocument />
    </Suspense>
  );
}
