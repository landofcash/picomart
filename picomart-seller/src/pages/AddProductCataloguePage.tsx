import {useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Button} from '@/components/ui/button'
import {useWallet} from '@/context/WalletContext'
import {ProductCatalogueSchema, type ProductCatalogue} from '@/lib/productSchemas'
import {validateSingleTokenCatalogue} from '@/lib/catalogueValidation.ts'
import TokenIcon from '@/components/TokenIcon'
import {priceToDisplayString, getSupportedTokens} from '@/lib/tokenUtils'
import {formatCryptoError} from '@/lib/cryptoFormat'
import {encodeBase64Uuid} from '@/lib/uuidUtils'
import {generateKeyPairFromB64} from '@/utils/keygen'
import {CRYPTO_NAME, CRYPTO_NAME_BLOCKCHAIN, signPrefix} from '@/config'
import {
  CloudUpload,
  Link2,
  ShieldCheck,
  Store,
  Wallet2,
  CheckCircle2,
  Key,
  FileSignature,
  Globe,
  Info
} from 'lucide-react'
import {getChainAdapter} from "@/lib/crypto/cryptoUtils.ts";

function AddProductCataloguePage() {
  const {walletAddress, signMessage, walletAdapter, walletCanTransact, walletBootstrapMessage, walletKind} = useWallet()
  const navigate = useNavigate()
  const location = useLocation();
  const state = location.state as { url?: string };
  const [catalogueUrl, setCatalogueUrl] = useState(state?.url || '');
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogue, setCatalogue] = useState<ProductCatalogue | null>(null)
  const [catalogueToken, setCatalogueToken] = useState<string | null>(null)
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [txId, setTxId] = useState<string | null>(null)

  // Two-step process state
  const [seed, setSeed] = useState<string>('')
  const [sellerPubKey, setSellerPubKey] = useState<string>('')
  const [isSigningStep, setIsSigningStep] = useState(false)
  const [isSigningComplete, setIsSigningComplete] = useState(false)

  const fetchCatalogue = async (url: string): Promise<{catalogue: ProductCatalogue; token: string}> => {
    const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'Accept': 'application/json'
        }
      })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Catalog not found at the specified URL')
      }
      throw new Error(`Failed to fetch catalog: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const parsedCatalogue = ProductCatalogueSchema.parse(data)
    const token = validateSingleTokenCatalogue(parsedCatalogue, getSupportedTokens().map(item => item.tokenId))
    return {catalogue: parsedCatalogue, token}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCatalogue(null)
    setCatalogueToken(null)
    setIsLoading(true)

    try {
      const result = await fetchCatalogue(catalogueUrl)
      setCatalogue(result.catalogue)
      setCatalogueToken(result.token)
    } catch (err) {
      let errorMessage = 'Failed to load catalog'

      if (err instanceof Error) {
        errorMessage = err.message
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String(err.message)
      }

      setError(errorMessage)
      setCatalogue(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignSeed = async () => {
    if (!walletAddress) {
      setError('Wallet not connected')
      return
    }

    setIsSigningStep(true)
    setError(null)

    try {
      // Generate a random seed (22-character base64-encoded UUID)
      const newSeed = encodeBase64Uuid(crypto.randomUUID())
      setSeed(newSeed)

      // Sign the seed with the wallet (chain adapter)
      const dataToSign = signPrefix + newSeed
      const signedBytes = await signMessage(
        dataToSign,
        "Sign seed for product creation"
      )

      // Generate a key pair from signed data
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signedBytes)))
      const keyPair = await generateKeyPairFromB64(signedBase64)
      setSellerPubKey(keyPair.publicKey)

      setIsSigningComplete(true)
    } catch (err) {
      setError(formatCryptoError(err))
    } finally {
      setIsSigningStep(false)
    }
  }

  const handleUploadToBlockchain = async () => {
    if (!walletAddress || !catalogueUrl || !seed || !sellerPubKey || !walletAdapter) return
    if (!walletCanTransact) {
      setError(walletBootstrapMessage ?? 'This wallet is not ready to submit Hedera transactions yet.')
      return
    }
    setIsUploading(true)
    setError(null)

    try {
      const result = await fetchCatalogue(catalogueUrl)
      setCatalogue(result.catalogue)
      setCatalogueToken(result.token)
      const newTxId = await getChainAdapter()
        .uploadCatalogUrlToBlockchain(walletAdapter, seed, sellerPubKey, catalogueUrl)
      setTxId(newTxId)
      setIsConfirmModalVisible(false)
      setIsSuccessModalVisible(true)
    } catch (err) {
      setError(formatCryptoError(err))
      setIsConfirmModalVisible(false)
    } finally {
      setIsUploading(false)
    }
  }

  const handleSuccessClose = () => {
    setIsSuccessModalVisible(false)
    navigate('/')
  }

  const resetProcess = () => {
    setSeed('')
    setSellerPubKey('')
    setIsSigningStep(false)
    setIsSigningComplete(false)
    setError(null)
  }

  const handleCatalogueUrlChange = (value: string) => {
    setCatalogueUrl(value)
    setCatalogue(null)
    setCatalogueToken(null)
    resetProcess()
  }

  if (!walletAddress) {
    return (
      <div className="px-4 py-8 sm:py-16">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Add Product Catalog</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Please connect your wallet to add a product catalog. </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500"/>
            How Storage works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-200 text-sm text-blue-700 space-y-3">
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 mt-0.5 text-blue-600 flex-shrink-0"/>
              <div>
                <p className="font-medium">Why store on the {CRYPTO_NAME_BLOCKCHAIN}?</p>
                <p className="text-blue-600">
                  When you add your catalog URL, it’s saved in a secure public record powered by the {CRYPTO_NAME_BLOCKCHAIN}.
                  This works like a decentralized database, ensuring shoppers can always find your products.
                  Only the link is stored on the {CRYPTO_NAME_BLOCKCHAIN}; the actual catalog (images and product details)
                  is hosted off-chain, under your full control. </p>
              </div>
            </div>

            <div className="flex items-start gap-3 ">
              <img src="/hedera-logo.svg" alt="Hedera" className="h-5 w-5 mt-0.5"/>
              <div>
                <p className="font-medium">What is {CRYPTO_NAME}?</p>
                <p className="text-blue-600">
                  {CRYPTO_NAME} is a fast, secure, and energy-efficient distributed ledger network.
                  It acts like a shared global database that no single company controls - making your catalog
                  link permanently available and tamper-proof. </p>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {walletKind === 'internal' && !walletCanTransact && (
        <Card className="w-full max-w-4xl mx-auto border-blue-200 bg-blue-50">
          <CardContent className="pt-6 text-sm text-blue-900">
            {walletBootstrapMessage ?? 'Activate and fund this internal wallet before submitting marketplace transactions.'}
          </CardContent>
        </Card>
      )}

      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500"/>
            Next Steps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-200 text-sm text-blue-700 space-y-3">
            <div className="flex items-start gap-3">
              <Link2 className="h-5 w-5 mt-0.5 text-blue-600 flex-shrink-0"/>
              <div>
                <p className="font-medium">Step 1 – Fetch & Review Your Catalog</p>
                <p className="text-blue-600">
                  Enter the URL where your catalog JSON is hosted.
                  Click <strong>Fetch & Review Catalog</strong> to preview your products before uploading to the
                  {CRYPTO_NAME_BLOCKCHAIN}. </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Key className="h-5 w-5 mt-0.5 text-blue-600 flex-shrink-0"/>
              <div>
                <p className="font-medium">Step 2 – Sign Catalog ID (Unique Seed)</p>
                <p className="text-blue-600">
                  Sign your unique catalog ID using your wallet.
                  This will generate a secure public/private key pair
                  that can be used to encrypt delivery data for future orders. </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CloudUpload className="h-5 w-5 mt-0.5 text-blue-600 flex-shrink-0"/>
              <div>
                <p className="font-medium">Step 3 – Submit to {CRYPTO_NAME}</p>
                <p className="text-blue-600">
                  After signing, your catalog link and public key will be stored on the {CRYPTO_NAME_BLOCKCHAIN}.
                  This makes your shop discoverable and order-ready. </p>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5"/>
            Fetch & Review Product Catalog
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="catalogueUrl" className="text-sm font-medium">
                Catalog URL
              </label>
              <Input id="catalogueUrl" type="url" value={catalogueUrl} onChange={(e) => handleCatalogueUrlChange(e.target.value)}
                     placeholder="https://example.com/products.json" required/>
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Loading...' : 'Fetch & Review Catalog'}
            </Button>
          </form>

          {catalogue && (
            <div className="space-y-4">
              <h3 className="font-semibold">Preview ({catalogue.length} products)</h3>
              {catalogueToken && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TokenIcon assetId={catalogueToken} size={20} alt={getSupportedTokens().find(token => token.tokenId === catalogueToken)?.name ?? catalogueToken}/>
                  <span>Catalog payment token: <strong>{getSupportedTokens().find(token => token.tokenId === catalogueToken)?.name ?? catalogueToken}</strong></span>
                </div>
              )}
              <div className="grid gap-4">
                {catalogue.map((product) => (
                  <div key={product.ProductId} className="p-4 border rounded-lg flex items-start gap-4">
                    <img src={product.Image} alt={product.Name} className="w-16 h-16 object-cover rounded-md"/>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium">{product.Name}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {product.Description}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <TokenIcon assetId={product.PriceToken}/>
                        <span className="text-sm font-medium">
                          {priceToDisplayString(product.PriceToken, product.Price)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Two-step process */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="font-semibold">Upload Process</h3>
                {/* Step 1: Sign Seed */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 p-4 border rounded-lg">
                  <div className="flex gap-4 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isSigningComplete ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                    }`}>
                      {isSigningComplete ? <CheckCircle2 className="w-5 h-5"/> : '1'}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">Sign Seed</h4>
                      <p className="text-sm text-muted-foreground">
                        Generate and sign a unique seed for your catalog </p>
                      {isSigningComplete && seed && (
                        <div className="mt-2 text-xs">
                          <p className="text-green-600">✓ Seed generated and signed</p>
                          <p className="font-mono text-muted-foreground">Seed: {seed}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Button and orange message stacked vertically */}
                  <div className="flex w-full sm:w-auto sm:ml-auto gap-2 mt-2 sm:mt-0">
                    <Button className="w-full sm:w-auto" onClick={handleSignSeed}
                            disabled={isSigningStep || isSigningComplete}
                            variant={isSigningComplete ? "outline" : "default"}>
                      {isSigningStep ? (
                        <>
                          <FileSignature className="w-4 h-4 mr-2 animate-spin"/>
                          Signing... </>
                      ) : isSigningComplete ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2"/>
                          Signed </>
                      ) : (
                        <>
                          <Key className="w-4 h-4 mr-2"/>
                          Sign Seed </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Step 2: Upload to Blockchain */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 p-4 border rounded-lg">
                  <div className="flex gap-4 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      !isSigningComplete ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                    }`}>
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">Upload to {CRYPTO_NAME}</h4>
                      <p className="text-sm text-muted-foreground">
                        Store your catalog on the {CRYPTO_NAME_BLOCKCHAIN} </p>
                    </div>
                  </div>
                  <Button className="w-full sm:w-auto sm:ml-auto" onClick={() => setIsConfirmModalVisible(true)}
                          disabled={!isSigningComplete}>
                    <CloudUpload className="w-4 h-4 mr-2"/>
                    Submit to {CRYPTO_NAME}
                  </Button>
                </div>

                {/* Reset button */}
                {(isSigningComplete || isSigningStep) && (
                  <Button variant="outline" onClick={resetProcess} className="w-full">
                    Reset Process
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      {isConfirmModalVisible && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50"
             onClick={() => !isUploading && setIsConfirmModalVisible(false)}>
          <div className="relative w-full max-w-2xl mx-auto p-8 bg-card border rounded-2xl shadow-lg space-y-6"
               onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setIsConfirmModalVisible(false)}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-2xl">
              ✕
            </button>

            <h2 className="text-2xl font-bold text-center">Ready to Upload Your Catalog</h2>
            <div className="space-y-4 text-base">
              <p className="font-medium">Before proceeding, please note:</p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Link2 className="w-5 h-5 mt-1 text-blue-500 flex-shrink-0"/>
                  <span className="text-muted-foreground">Your catalog URL will be permanently stored on the {CRYPTO_NAME_BLOCKCHAIN}</span>
                </li>
                <li className="flex items-start gap-3">
                  <Wallet2 className="w-5 h-5 mt-1 text-green-500 flex-shrink-0"/>
                  <span className="text-muted-foreground">A small network fee will apply when storing data</span>
                </li>
                <li className="flex items-start gap-3">
                  <Store className="w-5 h-5 mt-1 text-purple-500 flex-shrink-0"/>
                  <span className="text-muted-foreground">Keep your catalog URL active and accessible for customers to view your products</span>
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 mt-1 text-amber-500 flex-shrink-0"/>
                  <span className="text-muted-foreground">You can update products in your catalog anytime without additional transactions</span>
                </li>
              </ul>

              {/* Show seed and public key info */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p className="font-medium">Catalog Details:</p>
                <p className="text-sm"><strong>Seed:</strong> <span className="font-mono">{seed}</span></p>
                <p className="text-sm"><strong>Seller Public Key:</strong> <span
                  className="font-mono text-xs">{sellerPubKey}</span></p>
              </div>
            </div>
            <button onClick={handleUploadToBlockchain} disabled={isUploading}
                    className="w-full px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl text-primary-foreground font-semibold flex items-center justify-center gap-2">
              <CloudUpload className="w-5 h-5"/>
              {isUploading ? "Uploading... Please sign the transaction" : "I understand, proceed with upload"}
            </button>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {isSuccessModalVisible && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50" onClick={handleSuccessClose}>
          <div className="relative w-full max-w-2xl mx-auto p-8 bg-card border rounded-2xl shadow-lg space-y-6"
               onClick={(e) => e.stopPropagation()}>
            <button onClick={handleSuccessClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-2xl">
              ✕
            </button>

            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="w-16 h-16 text-green-500"/>
              </div>
              <h2 className="text-2xl font-bold">Success!</h2>
              <p className="text-muted-foreground">
                Your product catalog has been successfully uploaded! </p>
              {txId && (
                <div className="text-sm bg-muted/50 p-4 rounded-lg">
                  <p className="font-medium">Transaction ID:</p>
                  <p className="font-mono break-all">{txId}</p>
                </div>
              )}
              <div className="space-y-4 text-left mt-6">
                <h3 className="font-semibold">What's Next?</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Store className="w-5 h-5 mt-1 text-purple-500 flex-shrink-0"/>
                    <span>Your catalog is now accessible to potential customers</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 mt-1 text-amber-500 flex-shrink-0"/>
                    <span>You can update your products anytime through the catalog URL</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Link2 className="w-5 h-5 mt-1 text-blue-500 flex-shrink-0"/>
                    <span>Share your products with buyers and start selling!</span>
                  </li>
                </ul>
              </div>
            </div>
            <Button className="w-full mt-6" onClick={handleSuccessClose}>
              Got it, thanks!
            </Button>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div
          className="fixed bottom-6 right-6 bg-destructive text-destructive-foreground px-6 py-4 rounded-xl shadow-xl flex items-start gap-4 max-w-xl">
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Error</h3>
            <p className="leading-snug break-words whitespace-pre-wrap">{error}</p>
          </div>
          <button onClick={() => setError(null)}
                  className="text-destructive-foreground hover:opacity-80 text-xl leading-none"
                  aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

export default AddProductCataloguePage
