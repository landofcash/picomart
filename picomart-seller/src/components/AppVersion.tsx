import {APP_NAME, APP_VERSION} from '@/config'
import {cn} from '@/lib/utils'

export default function AppVersion({className}: {className?: string}) {
  return <p className={cn('text-center text-[10px] leading-4 text-muted-foreground', className)}>
    {APP_NAME} Seller · v{APP_VERSION}
  </p>
}
