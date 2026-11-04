import { useEffect, useRef } from "react";

export default function Hero({ onGetEarlyAccess }) {
  const sectionRef = useRef(null);

  useEffect(() => {
    const trigger = () => {
      if (!sectionRef.current) return;
      sectionRef.current
        .querySelectorAll(".hero-stagger")
        .forEach((el) => el.classList.add("is-entered"));
    };

    trigger();
    window.addEventListener("fg:preloader-done", trigger);
    return () => window.removeEventListener("fg:preloader-done", trigger);
  }, []);

  return (
    <section ref={sectionRef} className="hero" aria-labelledby="hero-h1">
      <div className="hero__content">
        <h1 className="hero__h1 hero-stagger" style={{ "--i": 0 }} id="hero-h1">
          Stop spoilage
          <br />
          <em>before</em> it costs you.
        </h1>
        <p className="hero__sub hero-stagger" style={{ "--i": 1 }}>
          FreshGuard combines FEFO inventory, ML risk scoring and demand
          forecasting so grocery and F&amp;B retailers recover value from stock
          before it expires, not after.
        </p>
        <div className="hero__actions hero-stagger" style={{ "--i": 2 }}>
          <a
            className="btn btn--primary btn--lg"
            href="#dashboard"
            onClick={onGetEarlyAccess}
          >
            Start Now
          </a>
          <a className="btn btn--outline btn--lg" href="#features">
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}
