import logoUrl from '@/assets/brand/endpoint-logo.svg'
import logoDarkUrl from '@/assets/brand/endpoint-logo-dark.svg'
import markUrl from '@/assets/brand/endpoint-mark.svg'
import markDarkUrl from '@/assets/brand/endpoint-mark-dark.svg'
import { cn } from '@/lib/utils'

/**
 * The Endpoint Clients logo for the current theme. On dark the black letters turn white and the indigo is lightened
 * (#8F95FF), as the brand guide allows for a reversed logo; both versions stay in the page and CSS shows the right one.
 */
export function BrandLogo({ className, alt }: { className?: string; alt: string }) {
  return (
    <>
      <img className={cn(className, 'dark:hidden')} src={logoUrl} alt={alt} />
      <img className={cn(className, 'hidden dark:block')} src={logoDarkUrl} alt={alt} aria-hidden="true" />
    </>
  )
}

/**
 * The indigo E mark alone, for the sidebar and small headers. `onDark` is for a surface that is dark in every theme
 * (the sidebar): it always uses the lightened version.
 */
export function BrandMark({ className, width, onDark }: { className?: string; width?: number; onDark?: boolean }) {
  if (onDark) return <img className={className} src={markDarkUrl} alt="" width={width} />
  return (
    <>
      <img className={cn(className, 'dark:hidden')} src={markUrl} alt="" width={width} />
      <img className={cn(className, 'hidden dark:block')} src={markDarkUrl} alt="" width={width} />
    </>
  )
}
