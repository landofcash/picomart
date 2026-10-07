import { useEffect } from "react";

let birdReady: Promise<void> | undefined;
function loadBird() {
  if (customElements.get("picomart-bird")) return Promise.resolve();
  if (!birdReady) {
    birdReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/picomart-bird.js";
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        birdReady = undefined;
        reject(new Error("Could not load the homepage bird."));
      };
      document.head.appendChild(script);
    });
  }
  return birdReady;
}

export default function HomepageBird() {
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    let active = true;
    let bird: HTMLElement | null = null;

    const update = async () => {
      if (!desktop.matches) {
        bird?.remove();
        bird = null;
        return;
      }
      await loadBird();
      if (!active || !desktop.matches || bird) return;
      bird = document.createElement("picomart-bird");
      bird.setAttribute("logo", "#site-logo");
      bird.setAttribute("target", "#start-selling");
      bird.setAttribute("size", "70");
      // Keep the mascot below the sticky header and account dialogs.
      bird.style.zIndex = "40";
      document.body.appendChild(bird);
    };
    const onChange = () => {
      void update().catch(() => {
        // A decorative asset must not interrupt the homepage or account action.
      });
    };
    onChange();
    desktop.addEventListener("change", onChange);
    return () => {
      active = false;
      desktop.removeEventListener("change", onChange);
      bird?.remove();
    };
  }, []);

  return null;
}
