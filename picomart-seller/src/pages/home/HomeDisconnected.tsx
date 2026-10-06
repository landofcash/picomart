import { useSellerWalletPopup } from "@/context/SellerWalletPopup";
import PicomartHero from "@/components/PicomartHero";

export default function HomeDisconnected() {
  const openAccount = useSellerWalletPopup();
  return (
    <div className="seller-home">
      <div aria-hidden="true" className="seller-home-background" />
      <div className="relative flex flex-1 items-center">
        <PicomartHero onStartSelling={openAccount} />
      </div>
    </div>
  );
}
