import {useEffect, useState} from "react";
import {get, set} from "idb-keyval";
import {Link} from "react-router-dom";
import {Button} from "@/components/ui/button";
import {APP_KEY_PREFIX} from "@/config";
import {tempoInternalWalletProvider as provider} from "@/lib/internalWallet/providers/tempoInternalWalletProvider";
import {configuredProofClient, decryptTempoProof, downloadTempoProof, exportTempoProof, importTempoProof, prepareTempoProof, uploadTempoProof, type TempoProofFile, type TempoRecoveryProof} from "@/lib/internalWallet/tempoRecoveryProof";
import type {InternalWalletStatus, InternalWalletSummary} from "@/lib/internalWallet/types";
import {lockWalletSession} from "@/lib/internalWallet/store";

const NETWORK = "moderato";
const proofKey = (address: string) => `${APP_KEY_PREFIX}_tempo_proof_v1_${address.toLowerCase()}`;
export default function TempoWalletPage() {
  const [wallets, setWallets] = useState<InternalWalletSummary[]>([]);
  const [active, setActive] = useState<InternalWalletStatus | null>(null);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [importKind, setImportKind] = useState<"mnemonic" | "privateKey">("mnemonic");
  const [importValue, setImportValue] = useState("");
  const [backup, setBackup] = useState("");
  const [proofPassword, setProofPassword] = useState("");
  const [encryptedProof, setEncryptedProof] = useState<TempoProofFile | null>(null);
  const [proof, setProof] = useState<TempoRecoveryProof | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);

  async function reload() {
    const [wallet, list] = await Promise.all([provider.getActiveWallet(NETWORK), provider.listWallets(NETWORK)]);
    setActive(wallet); setWallets(list);
  }
  useEffect(() => { void reload().catch(e => setError(String(e))); }, []);
  useEffect(() => {
    try { setStorageConfigured(configuredProofClient() !== null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  const activeId = active?.id;
  const activeAddress = active?.identity.evmAddress;
  useEffect(() => {
    let live = true;
    setBackup(""); setProof(null); setEncryptedProof(null); setProofPassword(""); setPassword(""); setConfirmation(""); setBackupAcknowledged(false);
    if (activeAddress) void get<TempoProofFile>(proofKey(activeAddress)).then(file => { if (live) setEncryptedProof(file ?? null); }).catch(e => { if (live) setError(String(e)); });
    return () => { live = false; if (activeId) void provider.lockWallet(activeId).catch(() => {}); };
  }, [activeId, activeAddress]);
  useEffect(() => {
    const hide = () => {
      setBackup(""); setProof(null); setPassword(""); setConfirmation(""); setImportValue(""); setProofPassword("");
      if (activeId) {
        lockWalletSession(activeId);
        void provider.lockWallet(activeId).catch(() => {});
      }
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", reloadAfterRestore);
    function reloadAfterRestore(event: PageTransitionEvent) { if (event.persisted) void reload().catch(e => setError(String(e))); }
    return () => { window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", reloadAfterRestore); };
  }, [activeId]);
  useEffect(() => {
    if (!backup) return;
    const timer = window.setTimeout(() => setBackup(""), 60_000);
    return () => window.clearTimeout(timer);
  }, [backup]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage(""); setBackup("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPassword(""); setConfirmation(""); setBusy(false); try { await reload(); } catch (e) { setError(String(e)); } }
  }
  function checkedPassword() {
    if (password.length < 8 || password !== confirmation) throw new Error("Enter matching wallet passwords of at least 8 characters.");
    return password;
  }
  async function persist(file: TempoProofFile, address: string) {
    await set(proofKey(address), file); setEncryptedProof(file);
  }
  function downloadFile() {
    if (!encryptedProof) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(encryptedProof)], {type: "application/json"}));
    const link = document.createElement("a"); link.href = url; link.download = "picomart-tempo-recovery-proof.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const adapter = provider.getWalletAdapter(NETWORK);
  const fieldClass = "block w-full rounded border px-3 py-2 bg-background text-foreground";
  return <main className="max-w-3xl mx-auto p-6 space-y-6">
    <Link to="/settings" className="underline">Back to settings</Link>
    <h1 className="text-2xl font-bold">Tempo built-in wallet</h1>
    <p>Moderato testnet · chain 42431. Create, back up and restore a local wallet, then check zkbytes recovery. Commerce writes remain controlled by the testnet migration switch.</p>
    <section className="space-y-3 border rounded p-4">
      <h2 className="text-xl font-semibold">Create or restore a wallet</h2>
      <label>Wallet label<input className={fieldClass} value={label} onChange={e => setLabel(e.target.value)} disabled={busy}/></label>
      <label>Wallet password<input className={fieldClass} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>
      <label>Confirm wallet password<input className={fieldClass} type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy}/></label>
      <Button disabled={busy} onClick={() => void run(async () => { await provider.createWallet(NETWORK, {passphrase: checkedPassword(), label}); setMessage("Wallet created. Reveal and save its recovery phrase before removing any local wallet."); })}>Create wallet</Button>
      <label>Recovery type<select className={fieldClass} value={importKind} onChange={e => { setImportKind(e.target.value as typeof importKind); setImportValue(""); }} disabled={busy}><option value="mnemonic">Recovery phrase</option><option value="privateKey">Private key</option></select></label>
      <label>Recovery secret<textarea className={fieldClass} autoComplete="off" spellCheck={false} value={importValue} onChange={e => setImportValue(e.target.value)} disabled={busy}/></label>
      <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await provider.importWallet(NETWORK, {passphrase: checkedPassword(), label, [importKind]: importValue}); setImportValue(""); setMessage("Wallet restored. Compare its address and open the recovery test file."); })}>Restore wallet</Button>
    </section>
    <section className="space-y-3 border rounded p-4">
      <h2 className="text-xl font-semibold">Local wallets</h2>
      {wallets.map(wallet => <Button key={wallet.id} variant={wallet.active ? "default" : "outline"} disabled={busy} onClick={() => void run(async () => { setActive(await provider.activateWallet(NETWORK, wallet.id)); })}>{wallet.label} · {wallet.identity.evmAddress.slice(0, 10)}</Button>)}
      {active && <>
        <p className="break-all">Address: {active.identity.evmAddress}</p>
        <p>{active.locked ? "Locked" : "Unlocked"} · Ethereum recovery path m/44'/60'/0'/0/0</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void run(async () => { await provider.unlockWallet(NETWORK, active.id, password); setMessage("Wallet unlocked."); })}>Unlock with wallet password</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await provider.lockWallet(active.id); setBackup(""); setProof(null); setMessage("Wallet locked."); })}>Lock</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const values = await provider.revealBackup(active.id); setBackup(values[0].value); })}>Reveal backup</Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const wallet = await provider.refreshWallet(NETWORK, active.id); setMessage(wallet.balances.map(b => `${b.formatted} ${b.symbol}`).join(" · ")); })}>Check testnet balances</Button>
        </div>
        {backup && <div className="space-y-2"><p>Save this secret privately. It disappears from this page after one minute.</p><output className="block break-all rounded border p-3">{backup}</output><Button variant="outline" disabled={busy} onClick={() => setBackup("")}>Hide backup</Button></div>}
        <label className="flex gap-2"><input type="checkbox" checked={backupAcknowledged} disabled={busy} onChange={e => setBackupAcknowledged(e.target.checked)}/>I saved the wallet backup and the encrypted recovery file.</label>
        <Button variant="destructive" disabled={busy} onClick={() => void run(async () => {
          if (!backupAcknowledged) throw new Error("Save both backups and check the acknowledgment before removing the local wallet.");
          await provider.removeWallet(NETWORK, active.id); setBackup(""); setProof(null); setEncryptedProof(null); setMessage("Local wallet removed. Restore from its saved recovery secret to test recovery.");
        })}>Remove local wallet for restore test</Button>
      </>}
    </section>
    <section className="space-y-3 border rounded p-4">
      <h2 className="text-xl font-semibold">zkbytes recovery proof</h2>
      <p>{storageConfigured ? "Storage configured. Upload is an explicit action after the test record is encrypted and saved locally." : "Storage is not configured. Local encryption and wallet restoration checks are available."}</p>
      <p>The recovery file contains the encrypted test object and its private locator. The wallet recovery secret and this file's password are separate backups. Test objects expire after seven days.</p>
      <label>Recovery-file password<input className={fieldClass} type="password" autoComplete="new-password" value={proofPassword} onChange={e => setProofPassword(e.target.value)} disabled={busy}/></label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !active || !!encryptedProof} onClick={() => void run(async () => {
          if (proofPassword.length < 8) throw new Error("Use a recovery-file password of at least 8 characters.");
          const prepared = await prepareTempoProof(adapter, configuredProofClient());
          const file = await exportTempoProof(prepared, proofPassword);
          await persist(file, prepared.address); setProof(prepared); setProofPassword(""); setMessage("Prepared and encrypted locally. Download the recovery file before uploading or restoring.");
        })}>Prepare recovery proof</Button>
        <Button variant="outline" disabled={busy || !encryptedProof} onClick={downloadFile}>Download encrypted recovery file</Button>
        <Button variant="outline" disabled={busy || !active || !encryptedProof} onClick={() => void run(async () => {
          const loaded = await importTempoProof(encryptedProof, proofPassword);
          const text = await decryptTempoProof(adapter, loaded); setProof(loaded); setProofPassword(""); setMessage(`Local recovery verified: ${text}`);
        })}>Open saved proof and decrypt locally</Button>
      </div>
      <label>Import encrypted recovery file<input className={fieldClass} type="file" accept=".json,application/json" disabled={busy || !active} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (file) void run(async () => {
          if (file.size > 1_000_000) throw new Error("Recovery file is too large.");
          const encrypted = JSON.parse(await file.text()) as TempoProofFile;
          const loaded = await importTempoProof(encrypted, proofPassword);
          const text = await decryptTempoProof(adapter, loaded);
          await persist(encrypted, loaded.address); setProof(loaded); setProofPassword(""); setMessage(`Restored file and wallet verified: ${text}`);
        });
      }}/></label>
      {proof && <>
        <p className="break-all">Receiving public key: {proof.receivingPublicKey}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !proof.reference} onClick={() => void run(async () => { setMessage(await uploadTempoProof(adapter, proof)); })}>Upload or resume same test object</Button>
          <Button variant="outline" disabled={busy || !proof.reference} onClick={() => void run(async () => { setMessage(`Hosted recovery verified: ${await downloadTempoProof(adapter, proof)}`); })}>Recover and decrypt hosted object</Button>
        </div>
      </>}
    </section>
    {message && <p role="status" className="border rounded p-3">{message}</p>}
    {error && <p role="alert" className="text-red-600 border rounded p-3">{error}</p>}
    <Link to="/settings" className="underline">Back to settings</Link>
  </main>;
}
