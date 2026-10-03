import {useSellerWalletPopup} from '@/context/SellerWalletPopup'
import PicomartHero from '@/components/PicomartHero'


function HomeDisconnected() {
  const openWallet=useSellerWalletPopup();
  return (
    <div className="relative overflow-hidden bg-[#F4F6FF]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at top left, rgba(130,89,239,0.12), transparent 30%), radial-gradient(circle at top right, rgba(0,49,255,0.10), transparent 24%), linear-gradient(180deg, #fbfbff 0%, #f1f4ff 54%, #f7f8ff 100%)',
        }}
      />
      <div aria-hidden className="absolute inset-x-0 top-0 z-0 h-px bg-gradient-to-r from-transparent via-black/[0.08] to-transparent"/>
      <div aria-hidden className="absolute -top-20 -right-16 z-0 h-72 w-72 rounded-full bg-[#8259EF]/14 blur-3xl"/>
      <div aria-hidden className="absolute left-[-6rem] top-40 z-0 h-80 w-80 rounded-full bg-[#0031FF]/12 blur-3xl"/>

      <div className="relative z-10 box-border flex min-h-[calc(100dvh-4rem)] w-full items-center px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <div className="w-full">
          <section className="flex items-center">
            <PicomartHero
              onStartSelling={openWallet}
            />
          </section>
        </div>

      </div>
    </div>
  )
}

export default HomeDisconnected
