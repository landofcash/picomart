import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  Globe,
  PackageCheck,
  QrCode,
  ShoppingBag,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section
        className="picomart-hero relative isolate py-14 text-center sm:py-20"
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
        <div className="mx-auto mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
          <Button
            size="lg"
            onClick={onStartSelling}
            variant="outline"
            className="hero-rainbow-button h-14 rounded-xl text-base"
          >
            <ShoppingBag className="h-4 w-4" />
            Start selling
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="hero-rainbow-button h-14 rounded-xl text-base"
          >
            <a href="#how-it-works">
              <ArrowDown className="h-4 w-4" />
              See how it works
            </a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground sm:text-sm">
          Create an account or restore yours to get started.
        </p>
      </section>

      <section
        id="how-it-works"
        className="scroll-mt-24 pb-16 sm:pb-20"
        aria-labelledby="selling-heading"
      >
        <div className="mb-8 flex items-center gap-4 sm:mb-10">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <h2
            id="selling-heading"
            className="flex items-center gap-2 text-base font-semibold sm:text-lg"
          >
            <ArrowDown className="h-4 w-4 text-primary" />
            Your products. More places.
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              Icon: ShoppingBag,
              title: "Add your products",
              text: "Create your catalog with product photos, descriptions, and prices.",
            },
            {
              Icon: Globe,
              title: "Share or print",
              text: "Create a storefront to share online. Print product QR codes for customers to scan in person.",
            },
            {
              Icon: PackageCheck,
              title: "Keep orders together",
              text: "View customer details, manage deliveries, and follow every order in your portal.",
            },
          ].map(({ Icon, title, text }, index) => (
            <article
              key={title}
              className="rounded-2xl border bg-card p-6 shadow-sm"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium tracking-widest text-muted-foreground">
                  0{index + 1}
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {text}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <article className="overflow-hidden rounded-2xl border bg-card">
            <div
              className="border-b bg-accent/30 p-5 sm:p-6"
              aria-label="Illustrative online storefront"
            >
              <div className="mb-4 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  Everyday finds
                </span>
                <span className="text-muted-foreground">
                  Example storefront
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { image: "speaker.png", name: "Orbit speaker", price: "120" },
                  { image: "luma.png", name: "Luma light", price: "85" },
                ].map((product) => (
                  <div
                    key={product.name}
                    className="overflow-hidden rounded-xl border bg-card"
                  >
                    <img
                      src={"/examples/" + product.image}
                      alt={product.name + " example product"}
                      width="1254"
                      height="1254"
                      loading="lazy"
                      decoding="async"
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <div className="p-3">
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {product.price} PathUSD
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Online
              </p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight">
                Your shop. One link away.
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Give your catalog a storefront and share it with customers,
                wherever they find you.
              </p>
            </div>
          </article>
          <article className="flex flex-col overflow-hidden rounded-2xl border bg-card">
            <div
              className="flex flex-1 items-center justify-center border-b bg-accent/30 px-5 py-8 sm:px-6"
              aria-label="Illustrative printed product tag"
            >
              <div className="flex w-full max-w-sm items-center gap-4 rounded-xl border bg-white p-5 text-slate-900 shadow-sm sm:gap-6">
                <QRCodeSVG
                  value="https://app.picomart.zkbytes.com"
                  size={104}
                  level="L"
                  marginSize={2}
                  title="Example QR opens Picomart"
                  className="h-24 w-24 shrink-0"
                />
                <div>
                  <QrCode className="mb-3 h-5 w-5 text-primary" />
                  <p className="text-lg font-bold leading-tight">
                    See it.
                    <br />
                    Scan it.
                    <br />
                    Order it.
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Example product tag
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Offline
              </p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight">
                Turn a display into a shop.
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Put product QR codes on shelves, market stalls, or packaging.
                Customers scan to browse and order on their phone.
              </p>
            </div>
          </article>
        </div>
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
          Illustrative examples. Product QR codes are created from your
          published catalog.
        </p>
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to make your next sale?
          </h2>
          <Button
            size="lg"
            onClick={onStartSelling}
            className="mt-5 rounded-xl"
          >
            Start selling
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
