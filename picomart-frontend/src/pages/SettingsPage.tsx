import {ArrowLeft, Bug, ChartNetwork} from 'lucide-react'
import {useEffect, useState} from 'react'
import {Button} from '@/components/ui/button'
import {CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Link} from 'react-router-dom'
import AppShellCard from '@/components/AppShellCard'
import {useWallet} from '@/context/WalletContext'
import {getAvailableNetworkIds} from '@/config'
import {getHcsTopicId} from '@/lib/hedera/hederaUtils'
import {getTrustedPicomartProfile, quoteKeyFingerprint, resetTrustedPicomartProfile, saveTrustedPicomartProfile} from '@/lib/agentOrders/trustedProfile'

function SettingsPage() {
  const {network, switchNetwork, walletKind, walletLocked, unlockInternalWallet} = useWallet()
  const availableNetworks = getAvailableNetworkIds()
  const [topicId, setTopicId] = useState<string | null>(null)
  const [topicError, setTopicError] = useState<string | null>(null)
  const [topicLoading, setTopicLoading] = useState(true)
  const [profileText, setProfileText] = useState(() => JSON.stringify(getTrustedPicomartProfile(), null, 2))
  const [profilePassword, setProfilePassword] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [fingerprints, setFingerprints] = useState<string[]>([])

  const labelFor = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)

  useEffect(() => {
    let cancelled = false

    const loadTopicId = async () => {
      setTopicLoading(true)
      setTopicError(null)

      try {
        const resolvedTopicId = await getHcsTopicId(network)
        if (cancelled) {
          return
        }
        setTopicId(resolvedTopicId)
      } catch (error) {
        if (cancelled) {
          return
        }
        setTopicId(null)
        setTopicError(error instanceof Error ? error.message : 'Failed to load topic ID')
      } finally {
        if (!cancelled) {
          setTopicLoading(false)
        }
      }
    }

    void loadTopicId()
    return () => {
      cancelled = true
    }
  }, [network])

  useEffect(() => {
    void Promise.all(getTrustedPicomartProfile().trustedQuoteKeys.map(key => quoteKeyFingerprint(key.publicKey)))
      .then(setFingerprints)
  }, [profileMessage])

  const updateTrustedProfile = async () => {
    setProfileMessage('')
    try {
      if (walletKind !== 'internal') throw new Error('Connect an internal wallet before changing the trust profile.')
      if (walletLocked) await unlockInternalWallet(profilePassword)
      const saved = saveTrustedPicomartProfile(JSON.parse(profileText))
      setProfileText(JSON.stringify(saved, null, 2))
      setProfilePassword('')
      setProfileMessage('Trusted profile saved. Pending approvals were invalidated.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to save trusted profile.')
    }
  }

  const restoreTrustedProfile = async () => {
    setProfileMessage('')
    try {
      if (walletKind !== 'internal') throw new Error('Connect an internal wallet before changing the trust profile.')
      if (walletLocked) await unlockInternalWallet(profilePassword)
      const value = resetTrustedPicomartProfile()
      setProfileText(JSON.stringify(value, null, 2))
      setProfilePassword('')
      setProfileMessage('Built-in profile restored. Pending approvals were invalidated.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to restore the trusted profile.')
    }
  }

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <a href="/tempo-wallet" className="block underline">Tempo built-in wallet and recovery checks</a>
          <a href="/tempo-contract" className="block underline">Tempo contract test runner</a>
          <div className="items-center gap-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ChartNetwork className="h-4 w-4"/>
              Picomart Network
            </div>
            <div className="flex gap-2 flex-wrap">
              {availableNetworks.map((id) => (
                <Button key={id}
                        variant={network === id ? 'default' : 'outline'}
                        onClick={() => switchNetwork(id)}
                        size="sm"
                        disabled={id === 'mainnet' || network === id}>
                  {labelFor(id)}
                </Button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              Mainnet is temporarily disabled.
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="text-muted-foreground">On-chain HCS Topic ID</div>
              <div className="break-all font-mono text-foreground">
                {topicLoading ? 'Loading…' : topicId?.trim() ? topicId : (topicError ?? 'Not set on-chain')}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t space-y-3">
            <div className="text-sm font-medium">Agent-order trust profile</div>
            <p className="text-xs text-destructive">
              High risk: these origins, contract, topic, and quote keys decide which agent orders this wallet may execute.
            </p>
            <div className="text-xs text-muted-foreground">
              Key fingerprints: {fingerprints.join(', ') || 'Loading…'}
            </div>
            <textarea className="min-h-48 w-full rounded-md border bg-background p-2 font-mono text-xs"
                      value={profileText} onChange={event => setProfileText(event.target.value)}/>
            {walletLocked && <input type="password" className="w-full rounded-md border px-3 py-2 text-sm"
                                    placeholder="Wallet passphrase required to save"
                                    value={profilePassword} onChange={event => setProfilePassword(event.target.value)}/>}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void updateTrustedProfile()}>Unlock and save</Button>
              <Button size="sm" variant="outline" onClick={() => void restoreTrustedProfile()}>Restore built-in</Button>
            </div>
            {profileMessage && <p className="text-xs text-muted-foreground">{profileMessage}</p>}
          </div>

          {/* Debug Section */}
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Bug className="h-4 w-4"/>
              Debug Tools
            </div>
            <div className="space-y-2">
              <Link to="/debug/encrypt" className="block w-full">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  🔐 Test Encryption
                </Button>
              </Link>
              <Link to="/debug/decrypt" className="block w-full">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  🔓 Test Decryption
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </AppShellCard>
    </div>
  )
}

export default SettingsPage
