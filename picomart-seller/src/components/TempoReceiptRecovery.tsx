import {useEffect,useRef,useState} from 'react';
import {useWallet} from '@/context/WalletContext';
import {Button} from '@/components/ui/button';
import {marketTransactions} from '@/lib/tempoMarket';
import {tempoTransactionError,type TempoTransactionRecord} from '@/lib/internalWallet/tempoTransactions';

export default function TempoReceiptRecovery(){
  const {walletAddress}=useWallet();
  const account=walletAddress?.toLowerCase();
  const [busy,setBusy]=useState(false),[checked,setChecked]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<TempoTransactionRecord|null>(null);
  const generation=useRef(0),running=useRef(false);
  useEffect(()=>{const token=generation;token.current++;setChecked(false);setReceipt(null);setError('');return()=>{token.current++;};},[account]);
  async function check(){
    if(!account||running.current)return;
    running.current=true;setBusy(true);setChecked(false);setError('');setReceipt(null);
    const current=generation.current;
    try{const saved=await marketTransactions.recover(account);if(current===generation.current){setReceipt(saved);setChecked(true);}}
    catch(e){if(current===generation.current)setError(tempoTransactionError(e));}
    finally{running.current=false;setBusy(false);}
  }
  return <section className="space-y-3 rounded border p-4">
    <h2 className="font-semibold">Commerce transaction receipt</h2>
    <Button variant="outline" disabled={busy||!account} onClick={()=>void check()}>Check saved receipt</Button>
    {checked&&<p role="status" className="break-all">{receipt?`${receipt.method}: ${receipt.state} · ${receipt.hash}`:'No saved commerce receipt for this wallet.'}</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
