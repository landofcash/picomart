import React from 'react'
import Header from './Header'
import {Toaster} from './ui/sonner'
import {useWallet} from '@/context/WalletContext'
import {Loader2} from 'lucide-react'
import {useLocation} from 'react-router-dom'

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({children}) => {
  const {walletActionPending, walletActionLabel} = useWallet()
  const workspace = /^\/storefronts\/[^/]+\/?$/.test(useLocation().pathname)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!workspace && <Header/>}
      <main className="flex-1">
        {children}
      </main>
      <Toaster richColors position="top-center" className="print:hidden"/>

      {walletActionPending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm print:hidden"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mx-4 w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin"/>
              <div className="text-sm font-medium">
                {walletActionLabel ?? 'Waiting for wallet approval…'}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Confirm or reject the request in your wallet app.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Layout
