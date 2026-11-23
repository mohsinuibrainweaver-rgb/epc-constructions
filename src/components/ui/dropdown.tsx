import * as React from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as S } from 'radix-ui'
import { useApp } from '@/app/AppContext'
import { cn } from '@/lib/utils'

/**
 * The app's drop-down. It is written like the old native <select> (a value, an onChange that receives
 * `e.target.value`, and <option> children), so a screen only changes the tag name, but it opens a designed list:
 * a rounded panel under the field with a check mark on the chosen item, roomy 44 px rows, a highlighted row that
 * follows the keyboard and the pointer, type-to-find, and scroll arrows on a long list.
 *
 * It is a real listbox for assistive technology (Radix Select): arrow keys, Home and End, typing to jump, Escape to close,
 * focus returns to the field. Labels, hints and errors reach it through `id`, `aria-label`, `aria-describedby`
 * and `aria-invalid` exactly as before. `tone="sidebar"` is for the dark sidebar, which is dark in both themes.
 */

interface Opt {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

// Radix does not allow an empty-string item value (it means "no selection"), so "" travels as this marker.
const EMPTY = '\u0000empty'
const enc = (v: string): string => (v === '' ? EMPTY : v)
const dec = (v: string): string => (v === EMPTY ? '' : v)

function collect(children: React.ReactNode, out: Opt[]): Opt[] {
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return
    const p = c.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode }
    if (c.type === React.Fragment) collect(p.children, out)
    else if (c.type === 'option') out.push({ value: p.value === undefined ? String(p.children ?? '') : String(p.value), label: p.children, disabled: p.disabled })
  })
  return out
}

type NativeProps = Omit<React.ComponentProps<'select'>, 'value' | 'onChange' | 'size' | 'children'>

export interface DropdownProps extends NativeProps {
  value?: string | number
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  children?: React.ReactNode
  /** Shown when the value matches none of the options. */
  placeholder?: string
  tone?: 'default' | 'sidebar'
  size?: 'default' | 'sm'
}

function Dropdown({ value, onChange, children, placeholder, tone = 'default', size = 'default', className, id, name, disabled, required, ...aria }: DropdownProps) {
  const { lang } = useApp()
  const options = React.useMemo(() => collect(children, []), [children])
  const current = value === undefined ? '' : String(value)
  const selected = options.find((o) => o.value === current)
  const side = tone === 'sidebar'

  return (
    <S.Root
      value={enc(current)}
      onValueChange={(v) => onChange?.({ target: { value: dec(v) }, currentTarget: { value: dec(v) } } as unknown as React.ChangeEvent<HTMLSelectElement>)}
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      name={name}
      disabled={disabled}
      required={required}
    >
      <S.Trigger
        id={id}
        data-slot="dropdown"
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        className={cn(
          'group flex w-full min-w-0 items-center justify-between gap-2 rounded-control border text-start transition-[color,box-shadow,border-color]',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
          side
            ? 'h-9 border-sidebar-foreground/45 bg-sidebar-accent px-3 text-sm text-sidebar-foreground hover:border-sidebar-foreground/70 data-[state=open]:border-sidebar-ring'
            : cn(
                'border-input bg-background px-3 text-base text-foreground hover:border-foreground/50 focus-visible:border-ring data-[state=open]:border-ring data-[placeholder]:text-muted-foreground',
                size === 'sm' ? 'h-9 text-sm' : 'h-11',
              ),
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <S.Value placeholder={placeholder}>{selected ? selected.label : undefined}</S.Value>
        </span>
        <S.Icon asChild>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180', side ? 'text-sidebar-foreground/70' : 'text-muted-foreground')}
          />
        </S.Icon>
      </S.Trigger>

      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          data-slot="dropdown-content"
          className={cn(
            'relative z-[60] max-h-[min(var(--radix-select-content-available-height),22rem)] min-w-[var(--radix-select-trigger-width)] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-xl border shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
            side ? 'border-sidebar-foreground/25 bg-sidebar-accent text-sidebar-foreground shadow-xl' : 'border-border bg-popover text-popover-foreground',
          )}
        >
          <S.ScrollUpButton className="flex h-7 items-center justify-center text-muted-foreground">
            <ChevronUp aria-hidden="true" className="size-4" />
          </S.ScrollUpButton>
          <S.Viewport className="p-1.5">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={enc(o.value)}
                disabled={o.disabled}
                className={cn(
                  'relative flex min-h-11 w-full cursor-default items-center rounded-lg py-2 ps-9 pe-3 text-sm/snug outline-hidden select-none sm:min-h-10',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:font-semibold data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-2 data-[highlighted]:outline-solid',
                  side
                    ? 'data-[highlighted]:bg-white/12 data-[highlighted]:text-white data-[highlighted]:outline-sidebar-ring'
                    : 'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:outline-ring',
                )}
              >
                <span aria-hidden="true" className="absolute inset-s-3 grid size-4 place-items-center">
                  <S.ItemIndicator>
                    <Check className={cn('size-4', side ? 'text-sidebar-primary' : 'text-primary')} strokeWidth={2.5} />
                  </S.ItemIndicator>
                </span>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
          <S.ScrollDownButton className="flex h-7 items-center justify-center text-muted-foreground">
            <ChevronDown aria-hidden="true" className="size-4" />
          </S.ScrollDownButton>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}

export { Dropdown }
