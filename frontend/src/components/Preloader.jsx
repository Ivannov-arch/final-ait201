import { useState, useEffect, useRef } from "react";

const dashboardPreloaderGif = `${import.meta.env.BASE_URL}preeloader-video/dashboard_preloader.gif`;

const phases = [
  { at: 15, text: "Dispatching inventory route..." },
  { at: 45, text: "Prioritizing FEFO stock batches..." },
  { at: 75, text: "Syncing store telemetry..." },
  { at: 100, text: "Arrived at hub." },
];

export default function Preloader({
  label = "Preparing FreshGuard dashboard...",
  onComplete,
}) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(label);
  const [isHidden, setIsHidden] = useState(false);
  const [isMounted, setIsMounted] = useState(true);

  const isDismissedRef = useRef(false);
  const intervalRef = useRef(null);
  const progressRef = useRef(0); // track real progress outside React state

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const triggerHeroStagger = () =>
      window.dispatchEvent(new Event("fg:preloader-done"));

    if (reduced) {
      setIsHidden(true);
      setIsMounted(false);
      triggerHeroStagger();
      if (onComplete) onComplete();
      return;
    }

    const isSessionVisited = sessionStorage.getItem("fg_visited");
    if (isSessionVisited && !label.includes("dashboard")) {
      setIsHidden(true);
      setIsMounted(false);
      triggerHeroStagger();
      if (onComplete) onComplete();
      return;
    }

    document.body.style.overflow = "hidden";

    // Reset progress ref on each fresh mount
    progressRef.current = 0;
    isDismissedRef.current = false;

    const dismiss = () => {
      if (isDismissedRef.current) return;
      isDismissedRef.current = true;

      clearInterval(intervalRef.current);
      setIsHidden(true);
      triggerHeroStagger();
      if (!label.includes("dashboard")) {
        sessionStorage.setItem("fg_visited", "1");
      }

      setTimeout(() => {
        document.body.style.overflow = "";
        setIsMounted(false);
        if (onComplete) onComplete();
      }, 850);
    };

    let currentProgress = 0;
    intervalRef.current = setInterval(() => {
      if (isDismissedRef.current) return;

      // slower ramp: max +1 per tick, slight stall near 90
      const delta = currentProgress < 90 ? 1 : Math.random() < 0.4 ? 1 : 0;
      currentProgress = Math.min(100, currentProgress + delta);
      progressRef.current = currentProgress;
      setProgress(currentProgress);

      for (const p of phases) {
        if (currentProgress >= p.at) {
          setStatus(p.text);
        }
      }

      if (currentProgress >= 100) {
        clearInterval(intervalRef.current);
        setStatus("Welcome to FreshGuard Hub!");
        setTimeout(() => dismiss(), 500);
      }
    }, 20);

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        dismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      clearInterval(intervalRef.current);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [label]);

  if (!isMounted) return null;

  return (
    <div
      id="preloader"
      className={`preloader${isHidden ? " is-hidden" : ""}`}
      aria-hidden={isHidden}
    >
      <div className="preloader__ambient"></div>
      <div className="preloader__content">
        <div className="preloader__sprite-wrap" aria-hidden="true">
          <img
            id="preloader-sprite"
            className="preloader__sprite preloader__gif"
            src={dashboardPreloaderGif}
            alt=""
          />
        </div>
        <div className="preloader__status" id="preloader-status">
          {status}
        </div>
        <div className="preloader__bar">
          <div
            className="preloader__bar-fill"
            id="preloader-bar"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="preloader__counter">
          <span id="preloader-count">{progress}</span>%
        </div>
      </div>
    </div>
  );
}
