import logoUrl from '@/assets/brand/endpoint-construction-logo.svg'
import logoWhiteUrl from '@/assets/brand/endpoint-construction-logo-white.svg'
import markUrl from '@/assets/brand/endpoint-construction-mark.svg'
import markWhiteUrl from '@/assets/brand/endpoint-construction-mark-white.svg'
import { cn } from '@/lib/utils'

/**
 * The EndPoint Construction logo for the current theme: the coloured one on light, the white one on dark. Both stay in the page
 * and CSS shows the right one. `onDark` is for a surface that is dark in every theme (the sidebar): it always uses the white one.
 */
export function BrandLogo({ className, alt, onDark }: { className?: string; alt: string; onDark?: boolean }) {
  if (onDark) return <img className={className} src={logoWhiteUrl} alt={alt} />
  return (
    <>
      <img className={cn(className, 'dark:hidden')} src={logoUrl} alt={alt} />
      <img className={cn(className, 'hidden dark:block')} src={logoWhiteUrl} alt={alt} aria-hidden="true" />
    </>
  )
}

/** The mark alone (the stacked E from the logo), for the sidebar when it is narrow and for small headers. `onDark` as above. */
export function BrandMark({ className, width, onDark }: { className?: string; width?: number; onDark?: boolean }) {
  if (onDark) return <img className={className} src={markWhiteUrl} alt="" width={width} />
  return (
    <>
      <img className={cn(className, 'dark:hidden')} src={markUrl} alt="" width={width} />
      <img className={cn(className, 'hidden dark:block')} src={markWhiteUrl} alt="" width={width} />
    </>
  )
}
