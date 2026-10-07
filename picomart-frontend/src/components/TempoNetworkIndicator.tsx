import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {Link} from 'react-router-dom';
import {useWallet} from '@/context/WalletContext';
import {tempoNetworkLabel} from '@/lib/tempoNetworks';
import {cn} from '@/lib/utils';

export default function TempoNetworkIndicator({className}:{className?:string}={}){
  const {network}=useWallet();
  const label=tempoNetworkLabel(network),testnet=network=== PICOMART_TEMPO_CONFIG.network;
  return <div className={cn(testnet?'sticky top-0 z-30 w-full shrink-0 bg-background print:hidden':'print:hidden',className)}>
    <Link to="/settings" data-network-indicator aria-label={testnet?`Testnet mode - do not use real funds. Network: ${label}. Open Settings`:`Network: ${label}. Open Settings`}
    className={testnet
      ?'block w-full border-b border-amber-500/10 bg-amber-500/10 px-4 py-1 text-center text-[9px] font-bold tracking-tight text-amber-600 transition-colors hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-amber-700'
      :'block w-full px-4 py-1 text-right text-[10px] text-muted-foreground hover:text-foreground print:hidden'}>
    {testnet?'TESTNET MODE - DO NOT USE REAL FUNDS':label}
  </Link></div>;
}
