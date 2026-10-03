import * as React from 'react'

import {cn} from '@/lib/utils'

import BrandLockup from '@/components/BrandLockup'
import {Card} from '@/components/ui/card'

type AppShellCardProps = React.ComponentProps<'div'>

function AppShellCard({className, children, ...props}: AppShellCardProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)} {...props}>
      <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.9))] px-6 py-4">
        <BrandLockup
          to="/"
          className="text-slate-950"
          wordmarkClassName="text-slate-950"
          logoClassName="drop-shadow-[0_10px_18px_rgba(15,23,42,0.08)]"
        />
      </div>
      <div className="flex flex-col gap-6 py-6">
        {children}
      </div>
    </Card>
  )
}

export default AppShellCard
