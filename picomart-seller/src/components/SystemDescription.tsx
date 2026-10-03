import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, Shield, Wallet, Users, Download, ChevronDown } from 'lucide-react'
import {APP_NAME, CRYPTO_NAME, CRYPTO_NAME_BLOCKCHAIN} from "@/config.ts";

interface SystemDescriptionProps {
  walletAddress: string | null
  setShowInstallModal: (show: boolean) => void
}

const SystemDescription: React.FC<SystemDescriptionProps> = ({ walletAddress, setShowInstallModal }) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* How It Works */}
        <Card className="border-emerald-200/70 bg-emerald-50/70 dark:bg-slate-800/60 backdrop-blur supports-[backdrop-filter]:bg-emerald-50/60">
          <CardHeader
            className="cursor-pointer select-none"
            role="button"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <Zap className="h-5 w-5 text-emerald-600" />
                <span className="text-slate-900 dark:text-white">How {APP_NAME} Works</span>
              </span>
              <ChevronDown
                className={`h-5 w-5 text-emerald-700 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              />
            </CardTitle>
          </CardHeader>
          {open && (
            <CardContent className="space-y-4">
              <p className="text-slate-700 dark:text-slate-300">
                {APP_NAME} is a decentralized e-commerce platform built on Hedera.
                It enables secure, transparent, and efficient online commerce without intermediaries.
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold">1</div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Create Product Catalogs</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">Upload your product listings to the {CRYPTO_NAME_BLOCKCHAIN}</p>
                    <p className="text-xs text-slate-700/90 dark:text-slate-300/90 mt-2 bg-emerald-50 p-2 rounded border-l-2 border-emerald-200">
                      <strong>Storage Options:</strong> You can create your catalog with {APP_NAME} Seller and store it on our CDN,
                      or host it on your own server. Only the link to your catalog is stored on the {CRYPTO_NAME_BLOCKCHAIN},
                      giving you flexibility while maintaining decentralization.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold">2</div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Generate QR Codes</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">Print QR codes for customers to scan and order</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold">3</div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Manage Orders</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">Track and fulfill customer orders securely</p>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Crypto Wallet Integration */}
        <Card className="border-emerald-200/70 bg-emerald-50/70 dark:bg-slate-800/60 backdrop-blur supports-[backdrop-filter]:bg-emerald-50/60">
          <CardHeader
            className="cursor-pointer select-none"
            role="button"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-600" />
                <span className="text-slate-900 dark:text-white">Crypto Wallet as Your Login</span>
              </span>
              <ChevronDown
                className={`h-5 w-5 text-emerald-700 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              />
            </CardTitle>
          </CardHeader>
          {open && (
            <CardContent className="space-y-4">
              <p className="text-slate-700 dark:text-slate-300">
                Your wallet serves as your secure login and identity on the {CRYPTO_NAME} network.
                No passwords, no accounts to manage - just your wallet.
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Secure cryptographic authentication</span>
                </div>

                <div className="flex items-center gap-3">
                  <Wallet className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Direct {CRYPTO_NAME_BLOCKCHAIN} transactions</span>
                </div>

                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-slate-800 dark:text-slate-200">Decentralized identity management</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-slate-800/70">
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  <strong>Note:</strong> Your wallet address is your unique seller identity.
                  All your products and orders are linked to this address on {CRYPTO_NAME}.
                </p>
              </div>

              {!walletAddress && (
                <div className="pt-3 border-t border-emerald-200/60 dark:border-slate-700/60">
                  <Button onClick={() => setShowInstallModal(true)} variant="outline" className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    Don't have Crypto Wallet? Install it.
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </>
  )
}

export default SystemDescription
