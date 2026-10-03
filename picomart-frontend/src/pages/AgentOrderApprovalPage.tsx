import {useEffect, useMemo, useRef, useState} from 'react'
import CatalogIdentity from '@/components/CatalogIdentity'
import {CheckCircle2, Clock3} from 'lucide-react'
import {formatUnits} from 'viem'
import {Link} from 'react-router-dom'
import {CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import AppFooter from '@/components/AppFooter'
import AppShellCard from '@/components/AppShellCard'
import TokenIcon from '@/components/TokenIcon'
import {useWallet} from '@/context/WalletContext'
import {useAgentOrderApprovalSession} from '@/context/AgentOrderApprovalSessionContext'
import {clearApprovalFragment, parseApprovalFragment} from '@/lib/agentOrders/approvalHandoff'
import {resolveAndValidateAgentOrder, type ValidatedAgentOrder} from '@/lib/agentOrders/quoteClient'
import {executeQuotedPicomartOrder} from '@/lib/agentOrders/agentOrderExecutor'
import {formatAgentOrderCountdown} from '@/lib/agentOrders/approvalCountdown'
import {getTrustedPicomartProfile, getTrustedProfileRevision} from '@/lib/agentOrders/trustedProfile'
import {getAgentOrderApprovalPrimaryAction} from '@/lib/agentOrders/approvalAction'
import {shouldResumeAgentOrderApprovalSession} from '@/lib/agentOrders/approvalSession'
import {explorerTxUrl} from '@/config'
import {
  QUOTE_NOT_EXECUTABLE_MESSAGE,
  assertQuoteExecutable,
  quoteExecutionDeadlineMilliseconds,
} from '@/lib/agentOrders/quoteExpiry'

type State = 'loading' | 'ready' | 'submitting' | 'success' | 'error'

export default function AgentOrderApprovalPage() {
  const {
    walletAdapter,
    walletAddress,
    walletCanTransact,
    walletLocked,
    walletBalances,
    signMessage,
  } = useWallet()
  const {
    state: approvalSessionState,
    setSession,
    expireSession,
    clearSession,
  } = useAgentOrderApprovalSession()
  const profile = useMemo(() => getTrustedPicomartProfile(), [])
  const [intent, setIntent] = useState<ValidatedAgentOrder | null>(null)
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('Resolving and verifying signed quote…')
  const [transactionId, setTransactionId] = useState('')
  const [clockNow, setClockNow] = useState(() => Date.now())
  const initialSessionStateRef = useRef(approvalSessionState)
  const profileRevisionRef = useRef<number | null>(null)
  const handoffSessionRef = useRef<{
    handoff: ReturnType<typeof parseApprovalFragment>
    fragmentCleared: boolean
  } | null>(null)
  const resolutionRef = useRef<Promise<ValidatedAgentOrder> | null>(null)

  useEffect(() => {
    let cancelled = false

    const shouldResumeSession = shouldResumeAgentOrderApprovalSession({
      hash: window.location.hash,
      hasPendingHandoff: handoffSessionRef.current !== null,
      hasPendingResolution: resolutionRef.current !== null,
    })
    if (shouldResumeSession) {
      const existing = initialSessionStateRef.current
      if (existing.status === 'active') {
        try {
          assertQuoteExecutable(existing.session.intent.quote)
          profileRevisionRef.current = existing.session.profileRevision
          setIntent(existing.session.intent)
          setState('ready')
          setMessage('')
        } catch {
          expireSession()
          setState('error')
          setMessage(QUOTE_NOT_EXECUTABLE_MESSAGE)
        }
      } else {
        setState('error')
        setMessage(existing.status === 'expired' ? QUOTE_NOT_EXECUTABLE_MESSAGE : 'Invalid approval link.')
      }
      return () => { cancelled = true }
    }

    try {
      if (!handoffSessionRef.current) {
        handoffSessionRef.current = {
          handoff: parseApprovalFragment(),
          fragmentCleared: false,
        }
      }
      if (!handoffSessionRef.current.fragmentCleared) {
        clearApprovalFragment()
        handoffSessionRef.current.fragmentCleared = true
      }
      if (!resolutionRef.current) {
        resolutionRef.current = resolveAndValidateAgentOrder(handoffSessionRef.current.handoff, profile)
      }
      const profileRevision = getTrustedProfileRevision()
      void resolutionRef.current.then(value => {
        handoffSessionRef.current = null
        resolutionRef.current = null
        if (!cancelled) {
          profileRevisionRef.current = profileRevision
          setSession({intent: value, profileRevision})
          setIntent(value)
          setState('ready')
          setMessage('')
        }
      }).catch(error => {
        handoffSessionRef.current = null
        resolutionRef.current = null
        if (!cancelled) {
          clearSession()
          setState('error')
          setMessage(error instanceof Error ? error.message : 'Quote validation failed.')
        }
      })
    } catch (error) {
      clearSession()
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Invalid approval link.')
    }
    return () => { cancelled = true }
  }, [clearSession, expireSession, profile, setSession])

  useEffect(() => {
    if (!intent || state !== 'ready') return
    const expire = () => {
      expireSession()
      setIntent(null)
      setState('error')
      setMessage(QUOTE_NOT_EXECUTABLE_MESSAGE)
    }
    const remaining = quoteExecutionDeadlineMilliseconds(intent.quote) - Date.now()
    if (remaining <= 0) {
      expire()
      return
    }
    const timeout = window.setTimeout(expire, remaining)
    return () => window.clearTimeout(timeout)
  }, [expireSession, intent, state])

  useEffect(() => {
    if (!intent || state === 'success' || state === 'error') return
    const interval = window.setInterval(() => {
      setClockNow(Date.now())
    }, 1_000)
    return () => window.clearInterval(interval)
  }, [intent, state])

  const approve = async () => {
    if (!intent || !walletAdapter) return
    try {
      assertQuoteExecutable(intent.quote)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : QUOTE_NOT_EXECUTABLE_MESSAGE)
      return
    }
    if (profileRevisionRef.current === null || getTrustedProfileRevision() !== profileRevisionRef.current) {
      clearSession()
      setState('error')
      setMessage('The trusted Picomart profile changed. Reopen the approval link.')
      return
    }
    setState('submitting'); setMessage('Encrypting order and submitting the atomic batch…')
    try {
      const tx = await executeQuotedPicomartOrder({quote: intent.quote, delivery: intent.delivery, walletAdapter, signMessage})
      clearSession()
      setTransactionId(tx)
      setState('success')
      setMessage('Order submitted. Public settlement evidence may take a few seconds.')
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'Order submission failed.')
    }
  }

  const primaryAction = getAgentOrderApprovalPrimaryAction({
    walletAddress,
    hasWalletAdapter: walletAdapter !== null,
    walletCanTransact,
    walletLocked,
  })
  const opensWallet = primaryAction === 'open-wallet' || primaryAction === 'finish-wallet-setup'
  const paymentAmount = intent
    ? formatUnits(BigInt(intent.quote.payment.amount), intent.quote.payment.decimals)
    : ''
  const expiryCountdown = intent
    ? formatAgentOrderCountdown(intent.quote.expiresAt, clockNow)
    : ''
  const isExpiringSoon = intent
    ? quoteExecutionDeadlineMilliseconds(intent.quote) - clockNow <= 2 * 60 * 1_000
    : false
  const approvalLabel = intent
    ? `${primaryAction === 'unlock-and-approve' ? 'Unlock and approve' : 'Approve and pay'} ${paymentAmount} ${intent.quote.payment.symbol}`
    : primaryAction === 'unlock-and-approve' ? 'Unlock and approve' : 'Approve and pay'

  return <div className="w-full flex items-start justify-center px-4 py-8">
    <AppShellCard className="w-full max-w-xl">
      <CardHeader className="border-b border-slate-200/80 pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Approve agent order</CardTitle>
            <CardDescription>Review the verified order details before approving payment.</CardDescription>
          </div>
          {intent && (
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">
                Hedera testnet
              </span>
              {state !== 'success' && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                  isExpiringSoon
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}>
                  <Clock3 aria-hidden="true" className="size-3.5"/>
                  Expires in {expiryCountdown}
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {intent && <>
          <section className="space-y-3" aria-labelledby="agent-order-items">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="agent-order-items" className="text-sm font-semibold text-slate-950">Order</h2>
                <p className="text-xs text-muted-foreground">Seller {intent.quote.catalog.sellerAccountId}</p>
                <CatalogIdentity seed={intent.quote.catalog.seed}/>
              </div>
              <span className="text-xs text-muted-foreground">
                {intent.quote.items.length} {intent.quote.items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="divide-y rounded-lg border border-slate-200">
              {intent.quote.items.map(item => (
                <div key={item.productId} className="flex items-center justify-between gap-4 p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-950">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Quantity {item.quantity}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
                    <TokenIcon assetId={intent.quote.payment.asset} size={16}/>
                    <span>{formatUnits(BigInt(item.lineAmount), intent.quote.payment.decimals)} {intent.quote.payment.symbol}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-5" aria-labelledby="agent-order-payment">
            <h2 id="agent-order-payment" className="text-sm font-semibold text-slate-950">Payment</h2>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <TokenIcon assetId={intent.quote.payment.asset} size={28}/>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order total</p>
                    <p className="text-sm text-slate-600">{intent.quote.payment.name}</p>
                  </div>
                </div>
                <p className="text-2xl font-semibold tracking-tight text-slate-950">
                  {paymentAmount} <span className="text-base">{intent.quote.payment.symbol}</span>
                </p>
              </div>
              <dl className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Shipping charge</dt>
                  <dd className="font-medium">0 {intent.quote.payment.symbol}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Delivery arrangement</dt>
                  <dd className="text-right font-medium">Seller-arranged</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Network fee</dt>
                  <dd className="max-w-60 text-right text-xs text-muted-foreground">Estimated separately by the wallet during signing</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-5" aria-labelledby="agent-order-delivery">
            <h2 id="agent-order-delivery" className="text-sm font-semibold text-slate-950">Delivery</h2>
            <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Recipient</dt>
                <dd className="font-medium text-slate-950">{intent.delivery.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Physical delivery</dt>
                <dd className="font-medium text-slate-950">{intent.delivery.noPhysicalDelivery ? 'No' : 'Yes'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Address</dt>
                <dd className="font-medium text-slate-950">
                  {intent.delivery.address}, {intent.delivery.city}, {intent.delivery.postalCode}, {intent.delivery.country}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="break-all font-medium text-slate-950">{intent.delivery.phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="break-all font-medium text-slate-950">{intent.delivery.email}</dd>
              </div>
              {intent.delivery.deliveryComments !== undefined && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Comments</dt>
                  <dd className="font-medium text-slate-950">{intent.delivery.deliveryComments}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-5" aria-labelledby="agent-order-wallet">
            <h2 id="agent-order-wallet" className="text-sm font-semibold text-slate-950">Wallet</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Connected wallet</dt>
                <dd className="break-all font-mono text-xs font-medium text-slate-950">{walletAddress ?? 'Not connected'}</dd>
              </div>
              <div>
                <dt className="mb-1.5 text-xs text-muted-foreground">Balances</dt>
                <dd className="space-y-1.5">
                  {walletBalances.length > 0 ? walletBalances.map(value => (
                    <div key={value.tokenId} className="flex items-center gap-2">
                      <TokenIcon assetId={value.tokenId} size={18}/>
                      <span className="font-medium text-slate-950">{value.formatted} {value.symbol}</span>
                    </div>
                  )) : <span className="text-muted-foreground">Unavailable</span>}
                </dd>
              </div>
            </dl>

            <details className="group border-t border-slate-200 pt-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-700">
                Technical details
                <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <dl className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Network and contract</dt>
                  <dd className="break-all font-mono text-slate-700">Hedera testnet · {intent.quote.picomart.contractId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Consensus topic</dt>
                  <dd className="break-all font-mono text-slate-700">{intent.quote.picomart.hcsTopicId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Quote expiry</dt>
                  <dd className="text-slate-700">{new Date(intent.quote.expiresAt * 1000).toLocaleString()}</dd>
                </div>
              </dl>
            </details>
          </section>

          <div className="space-y-3 border-t border-slate-200 pt-5">
          {state === 'ready' && opensWallet ? (
            <Button asChild className="w-full" size="lg">
              <Link to="/wallet?returnTo=/agent-orders/approve">
                {primaryAction === 'open-wallet' ? 'Open wallet' : 'Finish wallet setup'}
              </Link>
            </Button>
          ) : null}
          {!opensWallet && (state === 'ready' || state === 'submitting') ? (
            <Button className="w-full" size="lg" disabled={state !== 'ready'} onClick={approve}>
              {state === 'submitting' ? 'Submitting…' : approvalLabel}
            </Button>
          ) : null}
          {state === 'success' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex items-start gap-3">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600"/>
                <div className="space-y-1">
                  <p className="font-semibold">Order submitted</p>
                  <p className="text-sm text-emerald-800">{message}</p>
                  {transactionId && <a className="inline-block text-sm font-medium underline underline-offset-2" href={explorerTxUrl(transactionId, 'testnet')} target="_blank" rel="noreferrer">
                    View outer transaction {transactionId}
                  </a>}
                </div>
              </div>
            </div>
          )}
          </div>
        </>}
        {message && state !== 'success' && <p className={state === 'error' ? 'text-destructive text-sm' : 'text-sm text-muted-foreground'}>{message}</p>}
      </CardContent>
      <AppFooter/>
    </AppShellCard>
  </div>
}
