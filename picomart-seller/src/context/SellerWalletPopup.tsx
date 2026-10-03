import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "./WalletContext";
import { Popover } from "@/components/ui/popover";
import WalletPage from "@/pages/WalletPage";

const WalletPopup = createContext<() => void>(() => {});
export function SellerWalletPopupProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const { walletActionPending } = useWallet();
  const show = useCallback(() => setOpen(true), []);
  return (
    <WalletPopup.Provider value={show}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next || (!busy && !walletActionPending)) setOpen(next);
        }}
      >
        {children}
        <WalletPage
          open={open}
          onClose={() => setOpen(false)}
          onBusyChange={setBusy}
        />
      </Popover>
    </WalletPopup.Provider>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function useSellerWalletPopup() {
  return useContext(WalletPopup);
}
