import {Link} from 'react-router-dom';
import {useState} from 'react';
import TempoNetworkSwitch from '@/components/TempoNetworkSwitch';
import TempoMarketShell from '@/components/TempoMarketShell';
import {useWallet} from '@/context/WalletContext';
import {Button} from '@/components/ui/button';
import {agentProfileEditorInput,saveAgentProfile,resetAgentProfile} from '@/lib/agentOrders/tempoAgentProfile';
export default function TempoSettingsPage({seller=false}:{seller?:boolean}) {
  const wallet=useWallet();
  const [text,setText]=useState(()=>{try{return JSON.stringify(agentProfileEditorInput(),null,2);}catch{return '';}});
  const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function update(reset=false){
    if(busy)return;setBusy(true);setError('');setMessage('');
    try{
      if(wallet.walletKind!=='internal'||!wallet.walletAddress)throw new Error('Select a built-in wallet before changing trust settings.');
      if(wallet.walletActionPending)throw new Error('Finish the pending wallet action first.');
      if(wallet.walletLocked)await wallet.unlockInternalWallet(password);
      if(reset)resetAgentProfile();else saveAgentProfile(JSON.parse(text));
      setText(JSON.stringify(agentProfileEditorInput(),null,2));setMessage('Trust settings saved. Pending agent approvals were invalidated.');setPassword('');
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save trust settings.');}finally{setBusy(false);}
  }
  return <TempoMarketShell title="Settings" seller={seller}>
    <TempoNetworkSwitch/>
    <p>Payments and network fees use PathUSD. AlphaUSD is available as wallet metadata.</p>
    {!seller&&<section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Agent ordering trust settings</h2>
      <p>Configure the quote service, resource origin and trusted public signing keys. Only public configuration belongs here. Network and contract fields must match the selected supported profile.</p>
      <label className="block">Trusted profile<textarea aria-label="Trusted profile" className="block min-h-80 w-full rounded border bg-background p-2 font-mono text-sm" value={text} disabled={busy} onChange={e=>{setText(e.target.value);}}/></label>
      {wallet.walletLocked&&<label className="block">Wallet password<input type="password" autoComplete="current-password" className="block rounded border bg-background p-2" value={password} onChange={e=>setPassword(e.target.value)}/></label>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy||wallet.walletKind!=='internal'||wallet.walletActionPending} onClick={()=>void update()}>Save trust settings</Button>
      <Button variant="outline" disabled={busy||wallet.walletKind!=='internal'||wallet.walletActionPending} onClick={()=>void update(true)}>Restore configured defaults</Button></div>
      {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
    </section>}
    <Link className="block underline" to="/wallet">Wallet backup and recovery</Link>
    <Link className="block underline" to="/tempo-contract">Contract diagnostics</Link>
  </TempoMarketShell>;
}
