import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {useWallet} from '@/context/WalletContext';
import {Button} from '@/components/ui/button';
import TempoWalletPanel from '@/components/TempoWalletPanel';
import {tempoWalletRevision,assertTempoWalletRevision} from '@/lib/internalWallet/providers/tempoInternalWalletProvider';
import {BuilderClient, builderOrigin} from './client';
import type {SessionResponse} from './contracts';
import {StorefrontSessionContext as Context} from './sessionContext';
export function StorefrontSession({children}: {children: ReactNode}) {
  const wallet = useWallet();
  return <Session key={`${wallet.walletKind}:${wallet.network}:${wallet.walletAddress}:${wallet.activeInternalWalletId}:${wallet.walletLocked}`} >{children}</Session>;
}
function Session({children}: {children: ReactNode}) {
  const {walletAddress, walletKind, walletLocked, network, signMessage} = useWallet();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const live = useRef(true), sessionClient = useRef<BuilderClient | null>(null);
  const origin = builderOrigin();
  const clear = useCallback(() => { setSession(null); }, []);
  const client = useMemo(() => session && origin ? new BuilderClient(origin, network, session.token, clear) : null, [session, origin, network, clear]);
  useEffect(() => { sessionClient.current = client; }, [client]);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; void sessionClient.current?.logout().catch(() => {}); sessionClient.current = null; };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(clear, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [session, clear]);
  async function signIn() {
    if (!origin || !walletAddress || walletKind !== 'internal' || walletLocked || network!=='moderato' || busy) return;
    setBusy(true); setError(null);
    const api = new BuilderClient(origin, network),revision=tempoWalletRevision(),account=walletAddress.toLowerCase();
    try {
      const challenge = await api.challenge(account);
      if (!live.current) return;
      assertTempoWalletRevision(revision);
      const expected=['Picomart Storefront Builder sign in','Sign this message to manage your storefronts. This does not authorize a transaction.',
        `Origin: ${window.location.origin}`,`Account: ${account}`,`Network: ${network}`,`Chain ID: ${challenge.chainId}`,`Contract: ${challenge.contractAddress}`,
        `Challenge: ${challenge.challengeId}`,`Issued At: ${challenge.issuedAt}`,`Expires At: ${challenge.expiresAt}`].join('\n');
      if(challenge.accountId!==account||challenge.network!=='moderato'||challenge.chainId!==42431||challenge.contractAddress!=='0x3c91183f0454eab6eff6f570ac402be278dbd6f4'||
        challenge.origin!==window.location.origin||!Number.isFinite(Date.parse(challenge.expiresAt))||Date.parse(challenge.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(challenge.issuedAt))||
        Date.parse(challenge.expiresAt)<=Date.parse(challenge.issuedAt)||Date.parse(challenge.issuedAt)>Date.now()+30000||
        Date.parse(challenge.expiresAt)-Date.parse(challenge.issuedAt)>600000||challenge.message!==expected)throw new Error('The sign-in request did not match this wallet and website.');
      const bytes = await signMessage(challenge.message, 'Sign in to manage your storefronts');
      if (!live.current) return;
      assertTempoWalletRevision(revision);
      const signature = '0x' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      const result = await api.verify(account, challenge.challengeId, signature);
      if (live.current) {assertTempoWalletRevision(revision);if(result.accountId!==account||result.network!==network||!result.token||!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now())throw new Error('Unexpected builder session.');setSession(result);}
      else void new BuilderClient(origin, network, result.token).logout().catch(() => {});
    } catch (failure) { if (live.current) setError(failure instanceof Error ? failure.message : 'Sign in was not completed.'); }
    finally { if (live.current) setBusy(false); }
  }
  function signOut() { void client?.logout().catch(() => {}); clear(); }
  if (client) return <Context.Provider value={{client, signOut}}>{children}</Context.Provider>;
  return <div className="mx-auto max-w-lg px-6 py-20"><div className="rounded-2xl border bg-card p-8 shadow-sm">
    <Link to="/" className="mb-5 block text-sm text-muted-foreground hover:underline">← Seller dashboard</Link>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium text-primary">Picomart Storefronts</p>{walletAddress && walletKind === 'internal' && <TempoWalletPanel/>}</div><h1 className="text-2xl font-semibold">Your catalog. Your own shop.</h1>
    <p className="my-4 text-sm text-muted-foreground">Create a shop from your catalog, preview the design and refine it with a few words.</p>
    {!origin ? <p role="status">Storefronts are not configured for this seller portal yet.</p> : !walletAddress || walletKind !== 'internal' ? <>
      <p className="mb-4 text-sm">Connect your internal wallet to manage your storefronts.</p><TempoWalletPanel/>
    </> : <><p className="mb-4 text-sm text-muted-foreground">Sign a message with {walletAddress} on {network}. This starts a storefront session and does not authorize a transaction. After reloading, sign in again to restore your drafts and progress.</p>
      <Button onClick={() => void signIn()} disabled={busy||walletLocked}>{busy ? 'Signing in…' : 'Sign in with wallet'}</Button></>}
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
  </div></div>;
}
