import { useId } from 'react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { Check } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import type { Key } from '@/i18n/en'
import { cn } from '@/lib/utils'
import { setThemePref, useTheme, type ThemePref } from '@/theme'
import type { RowAria } from '@/components/settings'

const CHOICES: ThemePref[] = ['system', 'light', 'dark']

/** Fixed colours: each card shows what that choice looks like, whatever the app is showing now. */
const PALETTE = {
  light: { page: '#F5F5F5', bar: '#FFFFFF', card: '#FFFFFF', line: '#D4D4D4', text: '#A3A3A3', accent: '#4338CA' },
  dark: { page: '#0A0A0A', bar: '#141414', card: '#141414', line: '#2E2E2E', text: '#737373', accent: '#8F95FF' },
} as const

/** A tiny picture of the app: top bar, a card with two lines and a number, a button. */
function Mock({ tone }: { tone: 'light' | 'dark' }) {
  const c = PALETTE[tone]
  return (
    <g>
      <rect width="120" height="76" fill={c.page} />
      <rect width="120" height="14" fill={c.bar} />
      <circle cx="9" cy="7" r="3.5" fill={c.accent} />
      <rect x="18" y="5" width="30" height="4" rx="2" fill={c.text} />
      <rect x="10" y="22" width="100" height="32" rx="5" fill={c.card} stroke={c.line} />
      <rect x="17" y="29" width="34" height="4" rx="2" fill={c.text} />
      <rect x="17" y="38" width="56" height="8" rx="2" fill={c.accent} opacity="0.9" />
      <rect x="82" y="29" width="20" height="4" rx="2" fill={c.line} />
      <rect x="82" y="38" width="20" height="4" rx="2" fill={c.line} />
      <rect x="10" y="60" width="38" height="10" rx="5" fill={c.accent} />
    </g>
  )
}

/** The picture for one choice. "Same as device" is split down the diagonal: light on one side, dark on the other. */
function Preview({ choice }: { choice: ThemePref }) {
  const id = useId()
  return (
    <svg viewBox="0 0 120 76" aria-hidden="true" focusable="false" className="block h-auto w-full overflow-hidden rounded-md border border-[#9AA0B8]/60">
      {choice === 'system' ? (
        <>
          <defs>
            <clipPath id={`${id}-l`}>
              <polygon points="0,0 84,0 36,76 0,76" />
            </clipPath>
            <clipPath id={`${id}-d`}>
              <polygon points="84,0 120,0 120,76 36,76" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-l)`}>
            <Mock tone="light" />
          </g>
          <g clipPath={`url(#${id}-d)`}>
            <Mock tone="dark" />
          </g>
        </>
      ) : (
        <Mock tone={choice} />
      )}
    </svg>
  )
}

/**
 * Appearance as three picture cards: Same as device, Light, Dark. One radio group (arrow keys move, Space chooses);
 * the pictures are decoration, the text names the choice. Kept on this device.
 */
export function AppearanceCards({ aria }: { aria: RowAria }) {
  const { t } = useApp()
  const theme = useTheme()
  return (
    <RadioGroupPrimitive.Root
      aria-labelledby={aria.labelId}
      aria-describedby={aria.describedBy}
      value={theme.pref}
      onValueChange={(v) => setThemePref(v as ThemePref)}
      className="grid grid-cols-3 gap-3"
    >
      {CHOICES.map((choice) => (
        <RadioGroupPrimitive.Item
          key={choice}
          value={choice}
          className={cn(
            'grid min-w-0 content-start gap-2 rounded-xl border-2 border-input bg-background p-2 text-start transition-colors duration-150 hover:bg-accent',
            'data-[state=checked]:border-primary data-[state=checked]:bg-secondary',
          )}
        >
          <Preview choice={choice} />
          <span className="flex items-start gap-1.5 px-1 pb-1 text-sm leading-tight font-semibold">
            <span
              aria-hidden="true"
              className={cn('mt-px grid size-4 shrink-0 place-items-center rounded-full border-2', theme.pref === choice ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}
            >
              {theme.pref === choice && <Check className="size-3" strokeWidth={4} />}
            </span>
            {t(`set.theme.${choice}` as Key)}
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
