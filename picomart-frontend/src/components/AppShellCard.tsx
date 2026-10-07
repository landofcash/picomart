import * as React from 'react'

import {cn} from '@/lib/utils'

import BrandLockup from '@/components/BrandLockup'
import {Card} from '@/components/ui/card'
import TempoNetworkIndicator from '@/components/TempoNetworkIndicator'

type AppShellCardProps = React.ComponentProps<'div'>

function AppShellCard({className, children, ...props}: AppShellCardProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden rounded-none border-0 bg-background py-0 shadow-none sm:rounded-2xl sm:border sm:shadow-sm', className)} {...props}>
      <TempoNetworkIndicator className="hidden sm:block"/>
      <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-white px-5 py-3 sm:px-6 sm:py-4">
        <BrandLockup
          to="/"
          className="text-slate-950"
          wordmarkClassName="text-slate-950"
          logoClassName="drop-shadow-[0_10px_18px_rgba(15,23,42,0.08)]"
        />
      </div>
      <div className="flex flex-col gap-4 pb-6 pt-4">
        {children}
      </div>
    </Card>
  )
}

export default AppShellCard
