import React, {useEffect} from 'react'
import {X} from 'lucide-react'

interface WalletInstallModalProps {
  isOpen: boolean
  onClose: () => void
}

const WalletInstallModal: React.FC<WalletInstallModalProps> = ({isOpen, onClose}) => {
  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-[#041724]/55 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#8bb9d5]/30 bg-[linear-gradient(180deg,#fcfeff_0%,#f2f8fc_100%)] shadow-[0_32px_90px_-40px_rgba(3,23,36,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative bg-linear-to-r from-[#0a2940] via-[#0c4d73] to-[#0596d6] px-6 py-10 text-white">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 text-white/90 hover:text-white transition"
            aria-label="Close"
          >
            <X className="h-6 w-6"/>
          </button>
          <div className="space-y-2 text-center">
            <img src="/hedera-logo.svg" alt="Hedera logo" className="mx-auto h-12 w-12"/>
            <h3 className="text-2xl font-semibold">Use the built-in wallet</h3>
            <p className="text-sm text-sky-50/90">
              Picomart Seller can be tried with its encrypted built-in Hedera wallet directly in the app.
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6 text-center">
          <div className="space-y-3">
            <h4 className="text-lg font-semibold">Built-in wallet</h4>
            <p className="text-sm text-muted-foreground">
              Create or import a wallet from the wallet selector. The private key stays in your browser and is encrypted with your passphrase.
            </p>
          </div>

          <div className="rounded-xl border border-[#a8c8dc]/45 bg-white/80 p-4 text-left">
            <div className="font-medium mb-2">How it works</div>
            <p className="text-sm text-muted-foreground">
              Open the wallet selector, then create a new built-in wallet or import an existing recovery phrase or private key.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WalletInstallModal
