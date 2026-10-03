import {Wallet as WalletIcon} from "lucide-react";
import {Link} from "react-router-dom";
import {Button} from "@/components/ui/button";
import {useWallet} from "@/context/WalletContext";
import {truncateString} from "@/lib/cryptoFormat";

function formatWalletLabel(address: string | null) {
  if (!address) {
    return "Open Wallet";
  }
  return truncateString(address, 18);
}

const WalletAuth: React.FC = () => {
  const {walletAddress} = useWallet();

  return (
    <Link to="/wallet" className="block w-full">
      <Button
        variant={walletAddress ? "outline" : "default"}
        className="w-full justify-center"
        size="lg"
      >
        <WalletIcon className="h-5 w-5"/>
        {formatWalletLabel(walletAddress)}
      </Button>
    </Link>
  );
};

export default WalletAuth;
