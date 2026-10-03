import {useEffect,useState} from 'react';
import {useSellerWalletPopup} from '@/context/SellerWalletPopup';
import {useWallet} from '@/context/WalletContext';
import {Button} from './ui/button';
import {formatUnits} from 'ethers';

export default function TempoWalletPanel() {
  const openWallet=useSellerWalletPopup();
  const wallet=useWallet(),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const refreshInternalWallets=wallet.refreshInternalWallets;
  useEffect(()=>{void refreshInternalWallets().catch(()=>setError('Cannot load local wallets.'));},[refreshInternalWallets]);
  async function run(work:()=>Promise<void>) {
    if(busy)return;setBusy(true);setError('');
    try{await work();}catch{setError('Wallet action failed. Check the selected wallet and password.');}
    finally{setBusy(false);setPassword('');}
  }
  return <section className="rounded-xl border p-4 space-y-3">
    <h2 className="font-semibold">Built-in wallet Â· Tempo</h2>
    <label className="block">Wallet<select className="w-full rounded border p-2 bg-background" aria-label="Wallet" value={wallet.activeInternalWalletId??''} disabled={busy} onChange={e=>void run(()=>wallet.connectInternalWallet(e.target.value))}>
      <option value="">Select a wallet</option>{wallet.internalWallets.map(w=><option key={w.id} value={w.id}>{w.label} Â· {w.identity.evmAddress}</option>)}
    </select></label>
    {wallet.walletAddress&&<p className="break-all text-sm">{wallet.walletAddress} Â· {wallet.walletLocked?'Locked':'Unlocked'}</p>}
    {wallet.walletAddress&&wallet.walletLocked&&<label className="block">Wallet password<input type="password" autoComplete="current-password" className="w-full rounded border p-2 bg-background" value={password} onChange={e=>setPassword(e.target.value)}/></label>}
    {wallet.walletAddress&&<div className="flex flex-wrap gap-2">
      <Button disabled={busy||wallet.walletLocked&&!password} onClick={()=>void run(()=>wallet.walletLocked?wallet.unlockInternalWallet(password):wallet.lockInternalWallet())}>{wallet.walletLocked?'Unlock':'Lock'}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void run(wallet.refreshActiveInternalWallet)}>Refresh balances</Button>
    </div>}
    {wallet.walletBalances.map(b=><p key={b.tokenId} className="text-sm">{b.symbol}: {formatUnits(b.raw,b.decimals)}</p>)}
    <Button variant="link" onClick={openWallet}>Create, restore or back up a wallet</Button>
    <p className="text-xs text-muted-foreground">MetaMask support is being migrated. Use a built-in wallet for now.</p>
    {error&&<p role="alert">{error}</p>}
  </section>;
}

