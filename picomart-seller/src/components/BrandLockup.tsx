import {Link} from 'react-router-dom'

import {APP_NAME} from '@/config'
import {cn} from '@/lib/utils'

type BrandLockupProps = {
  className?: string
  logoClassName?: string
  wordmarkClassName?: string
  size?: 'shell' | 'hero'
  to?: string
}

function BrandLockup({
  className,
  logoClassName,
  wordmarkClassName,
  size = 'shell',
  to,
}: BrandLockupProps) {
  const logoSizeClass = size === 'hero' ? 'h-11 w-auto sm:h-12' : 'h-8 w-auto sm:h-9'
  const wordmarkSizeClass = size === 'hero' ? 'text-4xl sm:text-5xl' : 'text-[1.45rem] sm:text-[1.6rem]'

  const content = (
    <>
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        className={cn('block shrink-0', logoSizeClass, logoClassName)}
      />
      <span
        className={cn(
          'leading-none font-semibold tracking-[-0.045em] [font-family:var(--font-brand)]',
          wordmarkSizeClass,
          wordmarkClassName,
        )}
      >
        {APP_NAME}
      </span>
    </>
  )

  const sharedClassName = cn(
    'inline-flex items-center gap-3 text-foreground',
    to && 'rounded-xl transition-opacity duration-200 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/80',
    className,
  )

  if (to) {
    return (
      <Link to={to} aria-label={APP_NAME} className={sharedClassName}>
        {content}
      </Link>
    )
  }

  return <div className={sharedClassName}>{content}</div>
}

export default BrandLockup
