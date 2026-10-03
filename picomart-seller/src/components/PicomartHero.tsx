import { useRef } from "react"
import useEmblaCarousel from "embla-carousel-react"
import Autoplay from "embla-carousel-autoplay"
import {
  ArrowRight,
  ScanLine,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"

interface PicomartHeroProps {
  onStartSelling: () => void
}

type HeroSlide = {
  id: "catalog" | "cart" | "settlement"
  label: string
  title: string
  description: string
  image: string
}

const heroSlideImage = "/slides/slide-1.jpg"
const heroSlideImage2 = "/slides/slide-2.jpg"
const heroSlideImage3 = "/slides/slide-3.jpg"

const heroSlides: HeroSlide[] = [
  {
    id: "catalog",
    label: "QR product discovery",
    title: "Live catalog at the shelf",
    description: "Buyers scan a tag, open a product view instantly, and save items without creating an account.",
    image: heroSlideImage,
  },
  {
    id: "cart",
    label: "Saved cart flow",
    title: "Cart first, payment when ready",
    description: "Products stay organized in a buyer cart so checkout happens only when the customer is ready.",
    image: heroSlideImage2,
  },
  {
    id: "settlement",
    label: "Merchant settlement",
    title: "Orders settle directly on-ledger",
    description: "Merchants receive structured orders, encrypted buyer details, and a clear settlement status without intermediaries.",
    image: heroSlideImage3,
  },
]

function HeroSlideContent({ slide }: { slide: HeroSlide }) {
  const Icon = slide.id === "catalog" || slide.id === "cart" ? ScanLine : ShieldCheck

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[2rem] border border-black/[0.08] bg-white">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={slide.image}
          alt={slide.title}
          className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
        />
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,21,29,0.08)_0%,rgba(17,21,29,0.20)_34%,rgba(17,21,29,0.76)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(130,89,239,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(0,49,255,0.14),transparent_34%)]" />
      </div>

      {/* Content overlay */}
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
        <div className="max-w-md space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-white backdrop-blur-md">
            <Icon className="h-3.5 w-3.5" />
            {slide.label}
          </div>
          <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {slide.title}
          </h3>
          <p className="text-[0.95rem] leading-relaxed text-white/85">
            {slide.description}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function PicomartHero({ onStartSelling }: PicomartHeroProps) {
  const autoplay = useRef(
    Autoplay({
      delay: 4800,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    }),
  )
  const [emblaRef] = useEmblaCarousel({ loop: true, align: "start" }, [autoplay.current])


  return (
    <section className="relative isolate w-full overflow-hidden px-0 py-0">
      <div className="absolute -left-10 top-10 h-44 w-44 rounded-full bg-[#8259EF]/12 blur-3xl" aria-hidden />
      <div className="absolute right-0 top-1/3 h-52 w-52 rounded-full bg-[#0031FF]/12 blur-3xl" aria-hidden />

      <div className="relative grid gap-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-center">
        <div className="max-w-xl">
          <h1 className="text-[2.8rem] font-black uppercase leading-[0.94] tracking-[-0.05em] text-black sm:text-[3.7rem] lg:text-[4.75rem]">
            <span className="block">END-TO-END</span>
            <span className="block">ENCRYPTED RETAIL</span>
            <span className="block">PROTOCOL ON TEMPO</span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-7 text-slate-800 sm:text-lg sm:leading-8">
            <span className="block">Scan products. Save them to your cart. Pay when ready.</span>
            <span className="block">Retail without POS terminals, banks, or marketplaces.</span>
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="h-12 rounded-full border-0 bg-[linear-gradient(135deg,#8259EF_0%,#0031FF_100%)] px-6 text-white shadow-[0_20px_40px_-22px_rgba(0,49,255,0.45)] hover:brightness-110"
              onClick={onStartSelling}
            >
              Start selling
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-8 space-y-2 text-sm font-medium text-slate-800 sm:text-base">
            <p>Better than Shopify. Built for the{" "}
              <span className="relative inline-flex font-semibold text-black">
                <span className="absolute inset-x-0 bottom-0 h-2 rounded-full bg-[#0031FF]/16" aria-hidden />
                <span className="relative">Tempo ecosystem</span>
              </span>
              .
            </p>
          </div>
        </div>

        <div
          className="relative pb-0 sm:pb-0 lg:pb-0 bg-transparent"
          aria-label="Picomart retail flow previews"
          onFocusCapture={() => autoplay.current.stop()}
          onBlurCapture={() => autoplay.current.reset()}
        >
          <div className="overflow-hidden rounded-[2rem]" ref={emblaRef}>
            <div className="flex">
              {heroSlides.map((slide) => (
                <div key={slide.id} className="min-w-0 flex-[0_0_100%] p-1.5">
                  <div className="aspect-[4/3] sm:aspect-[16/10] xl:aspect-[16/9]">
                    <HeroSlideContent slide={slide} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
