import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {useWallet} from '@/context/WalletContext';
import {backupDeliverySets, deliverySetsChanged, loadDeliverySets, restoreDeliverySets} from '@/lib/deliverySets';

export default function DeliverySetsBackup() {
  const {walletAdapter} = useWallet();
  const [sets, setSets] = useState(loadDeliverySets);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => setSets(loadDeliverySets());
    window.addEventListener(deliverySetsChanged, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(deliverySetsChanged, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true); setStatus(''); setError('');
    try {await work();}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Delivery sets could not be updated.');}
    finally {setBusy(false);}
  }
  return <details className="rounded-2xl border bg-card px-5 py-2">
    <summary className="cursor-pointer text-sm font-medium">Delivery sets backup &amp; restore</summary>
    <fieldset disabled={busy} className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">Custom delivery sets are saved on this device. Optionally back them up to restore with the same wallet on another device. Backups are available for 29 days. Free defaults are always available and need no backup.</p>
      <p className="text-sm text-muted-foreground">Save your changes in <Link to="/delivery-options" className="underline">Delivery sets</Link> before backing up. Only saved sets are included.</p>
      {!walletAdapter && <p className="text-xs text-muted-foreground">Connect your wallet to back up or restore sets.</p>}
      <Button variant="outline" disabled={!walletAdapter || !sets.length} onClick={() => void run(async () => {
        const saved = loadDeliverySets();
        if (!saved.length) throw new Error('Save a custom delivery set before backing up.');
        const preparedCode = await backupDeliverySets(walletAdapter!, saved, setCode);
        setCode(preparedCode); setStatus('Backup saved. Keep its code to restore with the same wallet.');
      })}>Back up saved sets</Button>
      <div className="space-y-2"><label htmlFor="delivery-backup-code" className="block text-sm font-medium">Backup code</label>
        <input id="delivery-backup-code" className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm" value={code} onChange={event => setCode(event.target.value.trim())}/>
      </div>
      <p className="text-xs text-muted-foreground">Restoring replaces saved custom sets on this device. An open delivery editor must be reloaded to see the restored sets.</p>
      <Button variant="outline" disabled={!code || !walletAdapter} onClick={() => void run(async () => {
        if (!window.confirm('Replace saved custom delivery sets on this device? Reload any open delivery editor after restoring.')) return;
        const restored = await restoreDeliverySets(walletAdapter!, code);
        setSets(restored); setStatus('Custom delivery sets restored and saved on this device.');
      })}>Restore backup</Button>
      {status && <p role="status" className="text-sm text-primary">{status}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </fieldset>
  </details>;
}
