import {Link} from 'react-router-dom';
import {useWallet} from '@/context/WalletContext';
import {tempoNetworkLabel} from '@/lib/tempoNetworks';

export default function TempoNetworkIndicator(){
  const {network}=useWallet();
  const label=tempoNetworkLabel(network),testnet=network==='moderato';
  return <Link to="/settings" data-network-indicator aria-label={`Network: ${label}. Open Settings`}
    className={testnet
      ?'block w-full border-b border-amber-500/15 bg-amber-500/10 px-4 py-1 text-center text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-amber-700 print:hidden'
      :'block w-full px-4 py-1 text-right text-[10px] text-muted-foreground hover:text-foreground print:hidden'}>
    {testnet?'Testnet mode':label}
  </Link>;
}
