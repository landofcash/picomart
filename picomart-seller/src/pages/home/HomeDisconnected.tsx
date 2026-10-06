import { useSellerWalletPopup } from "@/context/SellerWalletPopup";
import PicomartHero from "@/components/PicomartHero";

export default function HomeDisconnected() {
  const openAccount = useSellerWalletPopup();
  return (
    <div>
      <PicomartHero onStartSelling={openAccount} />
    </div>
  );
}
