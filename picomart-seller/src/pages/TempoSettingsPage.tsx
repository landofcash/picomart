import {useSellerWalletPopup} from '@/context/SellerWalletPopup';
import {Button} from '@/components/ui/button';
import {Link} from 'react-router-dom';
import TempoNetworkSwitch from '@/components/TempoNetworkSwitch';
import TempoMarketShell from '@/components/TempoMarketShell';
export default function TempoSettingsPage({seller=false}:{seller?:boolean}) {
  const openWallet=useSellerWalletPopup();
  return <TempoMarketShell title="Settings" seller={seller}>
    
    <TempoNetworkSwitch/>
    <p>Payments and network fees use PathUSD. AlphaUSD is available as wallet metadata.</p>
    <Button variant="link" className="p-0" onClick={openWallet}>Wallet backup and recovery</Button>
    <Link className="block underline" to="/tempo-contract">Contract diagnostics</Link>
  </TempoMarketShell>;
}
