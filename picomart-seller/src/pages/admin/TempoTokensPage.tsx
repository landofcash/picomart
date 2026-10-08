import { useEffect, useRef, useState } from 'react';
import { PICOMART_TEMPO_CONFIG } from '@picomart/config';
import { useWallet } from '@/context/WalletContext';
import { useTempoAdmin } from '@/hooks/useTempoAdmin';
import { readConfiguredTokenStatus, validateTokenChange } from '@/lib/tempoAdmin';
import { marketTransactions, TEMPO_MARKET_ENABLED } from '@/lib/tempoMarket';
import { tempoTransactionError, type TempoTransactionRecord } from '@/lib/internalWallet/tempoTransactions';
import TempoMarketShell from '@/components/TempoMarketShell';
import TempoReceiptRecovery from '@/components/TempoReceiptRecovery';
import { useTransactionReview } from '@/components/TransactionReview';
import AccountUnlockButton from '@/components/wallet/AccountUnlockButton';
import { Button } from '@/components/ui/button';
import TokenIcon from '@/components/TokenIcon';

export default function TempoTokensPage() {
  const wallet = useWallet();
  const [refresh, setRefresh] = useState(0);
  const admin = useTempoAdmin(refresh);
  const [tokens, setTokens] = useState<Awaited<ReturnType<typeof readConfiguredTokenStatus>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [change, setChange] = useState<{ symbol: string; address: string; allowed: boolean } | null>(null);
  const [receipt, setReceipt] = useState<TempoTransactionRecord | null>(null);
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  const review = useTransactionReview({
    title: `${change?.allowed ? 'Enable' : 'Disable'} ${change?.symbol ?? 'token'}`,
    description: change?.allowed ? 'Allow this configured token for new orders and payments.' : 'Block new orders and payments using this token. Existing escrow payouts remain available.',
    approveLabel: change?.allowed ? 'Enable token' : 'Disable token',
    children: <p className="break-all text-sm">{change?.address}</p>,
  });
  useEffect(() => {
    let active = true;
    setTokens([]); setLoading(true); setError('');
    if (admin.isAdmin) void readConfiguredTokenStatus().then(value => {
      if (active) setTokens(value);
    }).catch(e => { if (active) setError(tempoTransactionError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin.isAdmin, refresh]);
  useEffect(() => {
    setReceipt(null); setChange(null);
    return () => { controller.current?.abort(); };
  }, [wallet.walletAddress, wallet.network, wallet.walletLocked]);

  async function update(token: typeof tokens[number]) {
    const account = wallet.walletAddress?.toLowerCase();
    if (!account || !admin.isAdmin || running.current) return;
    running.current = true; setBusy(true); setError(''); setReceipt(null);
    const allowed = !token.allowed;
    setChange({ symbol: token.symbol, address: token.tokenId, allowed });
    const abort = new AbortController(); controller.current = abort;
    const check = () => validateTokenChange(account, token.tokenId, allowed);
    try {
      await check(); abort.signal.throwIfAborted();
      const result = await marketTransactions.sendContract({ method: 'setPaymentTokenAllowed', args: [token.tokenId, allowed] }, {
        expectedAccount: account, operationId: `token:${crypto.randomUUID()}`, signal: abort.signal,
        beforeSign: check, reviewFee: review.reviewFee,
        onSaved: value => { if (!abort.signal.aborted) setReceipt(value); },
      });
      if (abort.signal.aborted) return;
      setReceipt(result);
      if (result.state !== 'confirmed') setError(`Transaction ${result.state}. Check the saved receipt before retrying.`);
      setRefresh(value => value + 1);
    } catch (e) {
      if (!abort.signal.aborted) setError(tempoTransactionError(e));
    } finally {
      running.current = false; setBusy(false);
    }
  }

  return <TempoMarketShell title="Token administration">
    {admin.loading ? <p role="status">Checking administrator access...</p> : admin.error ?
      <><p role="alert">{admin.error}</p><Button onClick={() => setRefresh(value => value + 1)}>Retry</Button></> : !admin.isAdmin ?
      <p>Connect the contract owner account on {PICOMART_TEMPO_CONFIG.label} to manage tokens.</p> : <>
      <p className="text-muted-foreground">Sync configured payment tokens with the smart contract. Only tokens in the application configuration are listed.</p>
      <Button variant="outline" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>Refresh status</Button>
      {!TEMPO_MARKET_ENABLED && <p>Contract transactions are disabled in this app.</p>}
      <AccountUnlockButton />
      {loading && <p role="status">Loading token status...</p>}
      {error && <p role="alert">{error}</p>}
      <div className="space-y-3">{tokens.map(token => <section key={token.tokenId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-2 font-semibold"><TokenIcon assetId={token.tokenId} />{token.name} ({token.symbol})</h2>
          <p className="break-all text-xs text-muted-foreground">{token.tokenId}</p>
          <p className="text-sm">{token.decimals} decimals · {token.allowed ? 'Enabled on-chain' : 'Not enabled on-chain'}</p>
        </div>
        <Button variant={token.allowed ? 'outline' : 'default'} disabled={busy || loading || wallet.walletLocked || !wallet.walletCanTransact || !TEMPO_MARKET_ENABLED}
          onClick={() => void update(token)}>{token.allowed ? 'Disable' : 'Enable'} {token.symbol}</Button>
      </section>)}</div>
      {busy && <p role="status">{review.awaitingApproval ? 'Review and approve the token change.' : receipt ? 'Waiting for transaction confirmation...' : 'Checking token and transaction fee...'}</p>}
      {receipt && <p role="status" className="break-all">Transaction {receipt.state}: <a className="underline" href={`${PICOMART_TEMPO_CONFIG.explorerUrl}/tx/${receipt.hash}`} target="_blank" rel="noreferrer">{receipt.hash}</a></p>}
      <TempoReceiptRecovery />
      {review.dialog}
    </>}
  </TempoMarketShell>;
}
