import React, {useState, useEffect, useCallback} from 'react'
import {Link} from 'react-router-dom'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {PackageSearch, ExternalLink, Store, Trash2, QrCode, Package, RefreshCw} from 'lucide-react'
import {fetchUserCatalogues, type CatalogData} from '@/lib/syncService'
import {useWallet} from '@/context/WalletContext'
import CopyableField from './CopyableField'
import {getChainAdapter} from "@/lib/crypto/cryptoUtils.ts";

const ProductCatalogueList: React.FC = () => {
  const {walletAddress, walletAdapter, walletCanTransact, walletKind, walletBootstrapMessage} = useWallet()
  const [catalogues, setCatalogues] = useState<CatalogData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingSeed, setDeletingSeed] = useState<string | null>(null)

  const loadCatalogues = useCallback(async () => {
    if (!walletAddress || (walletKind === 'internal' && !walletCanTransact)) {
      setCatalogues([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const userCatalogues = await fetchUserCatalogues(walletAddress)
      setCatalogues(userCatalogues)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalogs')
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress, walletCanTransact, walletKind])

  useEffect(() => {
    loadCatalogues()
  }, [loadCatalogues, walletAddress])

  const handleDelete = async (seed: string) => {
    if (!walletAddress || !walletAdapter) {
      setError('Wallet not connected')
      return
    }
    if (walletKind === 'internal' && !walletCanTransact) {
      setError(walletBootstrapMessage ?? 'This wallet is not ready for Hedera transactions yet.')
      return
    }

    if (!confirm('Are you sure you want to delete this catalog? This action cannot be undone.')) {
      return
    }

    setDeletingSeed(seed)
    setError(null)

    try {
      await getChainAdapter().deleteProductBoxOnBlockchain(walletAdapter, seed)
      await loadCatalogues()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete catalog')
    } finally {
      setDeletingSeed(null)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5"/>
              My Product Catalogs
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              disabled={true}
              className="opacity-50"
            >
              <RefreshCw className="h-4 w-4"/>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading catalogs...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (catalogues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5"/>
              My Product Catalogs
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={loadCatalogues}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}/>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Store className="h-12 w-12 text-muted-foreground mx-auto mb-4"/>
            <div className="text-muted-foreground mb-2">
              {walletKind === 'internal' && !walletCanTransact ? 'Wallet not ready for catalog lookups yet' : 'No product catalogs found'}
            </div>
            <div className="text-sm text-muted-foreground">
              {walletKind === 'internal' && !walletCanTransact
                ? (walletBootstrapMessage ?? 'Activate and fund this internal wallet first.')
                : 'Create your first catalog to get started'}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5"/>
            My Product Catalogs ({catalogues.length})
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadCatalogues}
            disabled={isLoading}
            title="Refresh catalogs"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}/>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {catalogues.map((catalogue, index) => {
            const seed = catalogue.seed
            const printQrHref = `/print-qr-codes?url=${encodeURIComponent(catalogue.catalogUrl || '')}&seed=${encodeURIComponent(seed)}`
            return (
              <div key={`${catalogue.shopWallet}-${index}`}
                   className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-start gap-4">
                  <Link
                    to={printQrHref}
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm transition hover:scale-[1.02] hover:bg-primary/15 hover:shadow-md"
                    title="Open QR codes"
                  >
                    <Store className="h-8 w-8"/>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                    {/* Seed - Most prominent */}
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary"/>
                          <span className="text-sm font-medium text-muted-foreground">Seed:</span>
                          <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                            <CopyableField value={seed} length={8} mdLength={22} small={true}/>
                          </span>
                        </div>

                    {/* Catalogue URL */}
                        {catalogue.catalogUrl && (
                          <div className="flex items-center gap-2">
                            <ExternalLink className="h-4 w-4 text-muted-foreground"/>
                            <span className="text-sm text-muted-foreground">Catalog:</span>
                            <a href={catalogue.catalogUrl} target="_blank" rel="noopener noreferrer"
                               className="text-sm text-primary hover:underline flex items-center gap-1 break-all">
                              <span className="truncate max-w-xs">
                                <CopyableField value={catalogue.catalogUrl} length={8} mdLength={42} small={true}/>
                              </span>
                              <ExternalLink className="h-3 w-3 shrink-0"/>
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          v{catalogue.version}
                        </div>
                        <Link to={printQrHref}>
                          <Button variant="outline" size="sm"
                                  className="text-primary hover:text-primary hover:bg-primary/10">
                            <QrCode className="h-4 w-4"/>
                          </Button>
                        </Link>
                        <Link to={`/storefronts?catalog=${encodeURIComponent(seed)}`} title="Create storefront from this catalog" aria-label="Create storefront from this catalog"><Button variant="outline" size="sm"><Store className="h-4 w-4"/></Button></Link>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(catalogue.seed)}
                                disabled={deletingSeed === seed}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          {deletingSeed === seed ? (
                            <div
                              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                          ) : (
                            <Trash2 className="h-4 w-4"/>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="text-sm text-destructive">{error}</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ProductCatalogueList
