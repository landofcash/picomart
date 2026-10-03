import {Link} from 'react-router-dom';
import {useWallet} from '@/context/WalletContext';
import {tempoNetworkLabel} from '@/lib/tempoNetworks';

export default function TempoNetworkIndicator(){
  const {network}=useWallet();
  const label=tempoNetworkLabel(network),testnet=network==='moderato';
  return <Link to="/settings" data-network-indicator aria-label={`Network: ${label}. Open Settings`}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 print:hidden ${testnet?'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100':'border-border bg-muted/30 text-muted-foreground hover:bg-muted'}`}>
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${testnet?'bg-amber-500':'bg-emerald-500'}`}/>{label}
  </Link>;
}
