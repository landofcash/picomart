import React from 'react'
import TempoNetworkIndicator from './TempoNetworkIndicator'
import {useLocation} from 'react-router-dom'

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({children}) => {
  const {pathname}=useLocation()
  const unframed=pathname==='/tempo-wallet'||pathname==='/tempo-contract'
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TempoNetworkIndicator className={unframed?undefined:'sm:hidden'}/>
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}

export default Layout
