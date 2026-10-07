import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiaTextReveal } from "@/components/ui/dia-text-reveal";
import { Highlighter } from "@/components/ui/highlighter";

const revealColors = [
  "var(--primary)",
  "var(--theme-accent-soft)",
  "var(--foreground)",
  "var(--primary)",
];

const messages = [
  {
    title: "Set up your shop.",
    accent: "Take it anywhere.",
    highlight: "Printed QR codes",
    description:
      "Your own online storefront. Printed QR codes for in-person sales. One place to manage every order.",
  },
  {
    title: "Your shop.",
    accent: "Clear payment rules.",
    highlight: "public smart contracts",
    description:
      "Sell through an open commerce protocol, with payments governed by public smart contracts rather than a platform’s changing rules.",
  },
  {
    title: "Your products.",
    accent: "Still in their cart.",
    highlight: "a cart on their phone",
    description:
      "Turn a quick scan into a chance to sell later. Customers scan your products, save them to a cart on their phone, and order when they’re ready.",
  },
];

export default function PicomartHero({
  onStartSelling,
}: {
  onStartSelling: () => void;
}) {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (hovered || focused || hidden || reducedMotion) return;
    const timer = window.setTimeout(
      () => setActive((index) => (index + 1) % messages.length),
      10000,
    );
    return () => window.clearTimeout(timer);
  }, [active, hovered, focused, hidden, reducedMotion]);

  return (
    <div className="mx-auto w-full max-w-[var(--hero-panel-width)] px-6 sm:px-14">
      <section
        className="picomart-hero relative isolate py-10 text-center sm:py-[clamp(1.5rem,6vh,5rem)]"
        aria-label="About Picomart"
        aria-roledescription="carousel"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false);
        }}
      >
        <div aria-hidden="true" className="hero-backdrop">
          <svg
            viewBox="0 0 640 520"
            preserveAspectRatio="none"
            fill="none"
            focusable="false"
          >
            <path d="M-80 410C140 600 650 480 550 180C510 60 370-30 220-70" />
            <path d="M-80 450C160 650 710 510 595 180C550 45 390-55 230-95" />
            <path d="M-80 490C180 700 770 540 640 180C590 30 410-80 240-120" />
          </svg>
        </div>
        <div className="mx-auto grid max-w-4xl">
          {messages.map((message, index) => (
            <div
              key={message.title}
              className={
                "col-start-1 row-start-1 transition-opacity duration-500 motion-reduce:transition-none " +
                (active === index
                  ? "opacity-100"
                  : "pointer-events-none opacity-0")
              }
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${messages.length}`}
              aria-hidden={active !== index}
              inert={active !== index}
            >
              <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-extrabold leading-[1.1] tracking-[-0.045em]">
                <span className="hero-headline-gradient">{message.title}</span>
                <br />
                {active === index ? (
                  <DiaTextReveal
                    text={message.accent}
                    colors={revealColors}
                    textColor="var(--primary)"
                    duration={1.35}
                    delay={0.15}
                  />
                ) : (
                  <span className="text-primary">{message.accent}</span>
                )}
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-7 sm:text-xl sm:leading-8">
                {message.description.split(message.highlight)[0]}
                {active === index ? (
                  <Highlighter
                    action="underline"
                    color="var(--primary)"
                    strokeWidth={1.5}
                    animationDuration={750}
                    iterations={1}
                  >
                    <strong className="font-semibold text-primary">
                      {message.highlight}
                    </strong>
                  </Highlighter>
                ) : (
                  <strong className="font-semibold text-primary">
                    {message.highlight}
                  </strong>
                )}
                {message.description.split(message.highlight)[1]}
              </p>
            </div>
          ))}
        </div>
        <div
          className="mt-7 flex items-center justify-center gap-1"
          aria-label="Homepage messages"
        >
          {messages.map((message, index) => (
            <button
              key={message.title}
              type="button"
              aria-label={`Show message ${index + 1}: ${message.title} ${message.accent}`}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
              className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span
                className={
                  "h-2 w-2 rounded-full transition-colors " +
                  (active === index
                    ? "bg-primary"
                    : "bg-primary/20 hover:bg-primary/40")
                }
              />
            </button>
          ))}
        </div>
        <div className="mx-auto mt-3 grid max-w-sm">
          <Button
            id="start-selling"
            size="lg"
            onClick={onStartSelling}
            variant="outline"
            className="hero-rainbow-button h-14 rounded-xl text-base"
          >
            <ShoppingBag className="h-4 w-4" />
            Start selling
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground sm:text-sm">
          Create an account or restore yours to get started.
        </p>
      </section>
    </div>
  );
}
