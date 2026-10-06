import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {useWallet} from '@/context/WalletContext';
import {Button} from '@/components/ui/button';
import {ArrowLeft, ArrowRight, Store} from 'lucide-react';
import AccountUnlockButton from '@/components/wallet/AccountUnlockButton';
import {useSellerWalletPopup} from '@/context/SellerWalletPopup';
import {tempoWalletRevision,assertTempoWalletRevision} from '@/lib/internalWallet/providers/tempoInternalWalletProvider';
import {BuilderClient, builderOrigin} from './client';
import type {SessionResponse} from './contracts';
import {StorefrontSessionContext as Context} from './sessionContext';
export function StorefrontSession({children}: {children: ReactNode}) {
  const wallet = useWallet();
  return <Session key={`${wallet.walletKind}:${wallet.network}:${wallet.walletAddress}:${wallet.activeInternalWalletId}:${wallet.walletLocked}`} >{children}</Session>;
}
function Session({children}: {children: ReactNode}) {
  const {walletAddress, walletKind, walletLocked, network, signMessage, walletActionPending} = useWallet();
  const openAccount = useSellerWalletPopup();
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
    if (!origin || !walletAddress || walletKind !== 'internal' || walletLocked || network!== PICOMART_TEMPO_CONFIG.network || busy) return;
    setBusy(true); setError(null);
    const api = new BuilderClient(origin, network),revision=tempoWalletRevision(),account=walletAddress.toLowerCase();
    try {
      const challenge = await api.challenge(account);
      if (!live.current) return;
      assertTempoWalletRevision(revision);
      const expected=['Picomart Storefront Builder sign in','Sign this message to manage your storefronts. This does not authorize a transaction.',
        `Origin: ${window.location.origin}`,`Account: ${account}`,`Network: ${network}`,`Chain ID: ${challenge.chainId}`,`Contract: ${challenge.contractAddress}`,
        `Challenge: ${challenge.challengeId}`,`Issued At: ${challenge.issuedAt}`,`Expires At: ${challenge.expiresAt}`].join('\n');
      if(challenge.accountId!==account||challenge.network!== PICOMART_TEMPO_CONFIG.network||challenge.chainId!==PICOMART_TEMPO_CONFIG.chainId||challenge.contractAddress!==PICOMART_TEMPO_CONFIG.deployment.address||
        challenge.origin!==window.location.origin||!Number.isFinite(Date.parse(challenge.expiresAt))||Date.parse(challenge.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(challenge.issuedAt))||
        Date.parse(challenge.expiresAt)<=Date.parse(challenge.issuedAt)||Date.parse(challenge.issuedAt)>Date.now()+30000||
        Date.parse(challenge.expiresAt)-Date.parse(challenge.issuedAt)>600000||challenge.message!==expected)throw new Error('The sign-in request did not match this account and website.');
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
  const hasAccount = !!walletAddress && walletKind === 'internal';
  return <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-14">
    <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true"/>Dashboard</Link>
    <section aria-labelledby="storefront-entry-title" className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-12 sm:w-12"><Store className="h-6 w-6" aria-hidden="true"/></div>
        <h1 id="storefront-entry-title" className="text-xl font-semibold tracking-tight sm:text-3xl">Your Storefront</h1>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Create a storefront from your catalog. Preview the design and refine it with a few words.</p>
      {!origin ? <p role="status" className="mt-6 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">Storefronts are not configured for this seller portal yet.</p> : <>
        <div className="mt-6">
          {!hasAccount ? <Button className="w-full" onClick={openAccount} disabled={walletActionPending}>{walletAddress ? 'Choose a Picomart account' : 'Create or restore account'}</Button>
            : walletLocked ? <AccountUnlockButton variant="default"/>
            : <Button className="w-full" onClick={() => void signIn()} disabled={busy || walletActionPending || network !== PICOMART_TEMPO_CONFIG.network}>{busy ? 'Signing in…' : 'Continue to storefronts'}<ArrowRight className="h-4 w-4" aria-hidden="true"/></Button>}
        </div>
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">Confirm your account to manage your storefronts. This won’t move any funds.</p>
        {hasAccount && network !== PICOMART_TEMPO_CONFIG.network && <p role="status" className="mt-4 text-sm text-muted-foreground">Storefronts are available in Demo mode. Change your operating mode in <Link to="/settings" className="text-primary underline">Settings</Link> to continue.</p>}
      </>}
      {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
    </section>
  </div>;
}
