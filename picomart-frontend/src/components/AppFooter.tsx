import {APP_VERSION} from '@/config'
import {cn} from '@/lib/utils'
import {CardFooter} from '@/components/ui/card'

type AppFooterProps = {
  className?: string
}

function AppFooter({className}: AppFooterProps) {
  return (
    <CardFooter className={cn('justify-center py-1 text-xs text-muted-foreground', className)}>
      © {new Date().getFullYear()} PICOMART · v{APP_VERSION}
    </CardFooter>
  )
}

export default AppFooter
