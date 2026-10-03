import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useWallet } from '@/context/WalletContext'
import { Button } from '@/components/ui/button'
import { useEffect } from 'react'

function SettingsPage() {
  const { network, switchNetwork, walletKind, walletAddress, internalAddresses, refreshInternalAddresses, activateInternalAddress, connect } = useWallet()

  useEffect(() => {
    void refreshInternalAddresses()
  }, [refreshInternalAddresses])

  return (
    <div className="px-4 py-8 sm:py-16">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <a href="/tempo-wallet" className="block underline">Tempo built-in wallet and recovery checks</a>
          <a href="/tempo-contract" className="block underline">Tempo contract test runner</a>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground">Crypto Network</span>
            <div className="flex items-center gap-2">
              <Button
                variant={network === 'testnet' ? 'default' : 'outline'}
                onClick={() => switchNetwork('testnet')}
                size="sm"
                disabled={network === 'testnet'}
              >
                Testnet
              </Button>
              <Button
                variant={network === 'mainnet' ? 'default' : 'outline'}
                size="sm"
                disabled
              >
                Mainnet
              </Button>
              <span className="text-xs text-muted-foreground">Mainnet temporarily disabled</span>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Internal Wallets</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => connect({ kind: 'internal', silent: false })}
              >
                {walletKind === 'internal' ? 'Create another' : 'Create internal wallet'}
              </Button>
            </div>
            <div className="mt-3">
              {internalAddresses.length === 0 ? (
                <div className="text-sm text-muted-foreground">No internal wallets saved yet.</div>
              ) : (
                <ul className="space-y-2">
                  {internalAddresses.map(addr => (
                    <li key={addr} className="flex items-center justify-between">
                      <code className="text-xs break-all">{addr}</code>
                      {walletKind === 'internal' && walletAddress === addr ? (
                        <span className="text-xs text-green-600">Active</span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => activateInternalAddress(addr)}>
                          Activate
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default SettingsPage
