import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Layers3, Package, Plus, Printer, Scale, Tags, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { cn } from '@/lib/utils'

const COMPACT_HEADING = 'gap-2 text-base [&>span:first-child]:size-7 [&>span:first-child>svg]:size-4'
import { CardHeading } from '@/components/CardHeading'
import { COMPARE_GRID, CompareBars, DeltaBadge, KeyChip, Legend, PaceChart, RateChangeBars, type BarRow, type RateRow } from '@/components/CompareParts'
import { EmptyState, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dropdown } from '@/components/ui/dropdown'
import { ViewTabs } from '@/components/ui/tabs'
import { usePayments, usePhases } from '@/db/hooks'
import type { Key } from '@/i18n/en'
import {
  comparePace, comparePhases, compareCategories, compareMaterials, delta, NO_PHASE, paceSeries, perAreaBasis, phaseInsights, sortPhaseRows, summarizeSide, TOTALS,
  type Delta, type PhaseSort, type Side,
} from '@/lib/compare'
import { formatDate, money, moneyRate, todayISO } from '@/lib/format'
import { pctText } from '@/components/CompareParts'

const num = (n: number): string => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

/** Compare two projects: where the money went in an earlier one and where it is going in this one. */
export function Compare() {
  const { t, lang, project, projects, phaseName } = useApp()
  const [sp, setSp] = useSearchParams()

  const ids = new Set(projects.map((p) => p.id))
  const bId = sp.get('b') && ids.has(sp.get('b')!) ? sp.get('b')! : project?.id
  const aWanted = sp.get('a') && ids.has(sp.get('a')!) ? sp.get('a')! : undefined
  const aId = aWanted ?? projects.find((p) => p.id !== bId)?.id
  const A = projects.find((p) => p.id === aId)
  const B = projects.find((p) => p.id === bId)

  const choose = (which: 'a' | 'b', id: string) =>
    setSp(
      (cur) => {
        const next = new URLSearchParams(cur)
        next.set('a', which === 'a' ? id : aId ?? '')
        next.set('b', which === 'b' ? id : bId ?? '')
        return next
      },
      { replace: true },
    )
  const basisKey = sp.get('per') === 'sqft' ? 'sqft' : 'total'
  const setBasis = (v: string) =>
    setSp(
      (cur) => {
        const next = new URLSearchParams(cur)
        if (v === 'sqft') next.set('per', 'sqft')
        else next.delete('per')
        return next
      },
      { replace: true },
    )

  const payA = usePayments(aId)
  const payB = usePayments(bId)
  const phA = usePhases(aId)
  const phB = usePhases(bId)

  const sideA = useMemo<Side | undefined>(() => (A ? { project: A, payments: payA, phases: phA } : undefined), [A, payA, phA])
  const sideB = useMemo<Side | undefined>(() => (B ? { project: B, payments: payB, phases: phB } : undefined), [B, payB, phB])

  if (projects.length < 2) {
    return (
      <>
        <PageHeader title={t('compare.title')} />
        <Card>
          <EmptyState
            icon={Scale}
            title={t('compare.needTwo')}
            body={t('compare.needTwoBody')}
            action={
              <Button variant="secondary" asChild>
                <Link to="/projects/new">
                  <Plus aria-hidden="true" />
                  {t('projects.new')}
                </Link>
              </Button>
            }
          />
        </Card>
      </>
    )
  }

  // The two choices. The colour key beside each name is the key for every chart below.
  const controls = (
    <div>
      <div className="relative grid grid-cols-2 border-b">
        <span aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-border" />
        {([['a', t('compare.projectA'), aId], ['b', t('compare.projectB'), bId]] as const).map(([side, label, value]) => (
          <div key={side} className="grid min-w-0 content-start gap-1.5 px-3 py-2.5 sm:px-4">
            <span className="text-xs font-semibold text-muted-foreground sm:text-sm">
              <KeyChip side={side}>{label}</KeyChip>
            </span>
            <Dropdown aria-label={label} value={value ?? ''} onChange={(e) => choose(side, e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Dropdown>
          </div>
        ))}
      </div>
    </div>
  )

  if (!sideA || !sideB || sideA.project.id === sideB.project.id) {
    return (
      <>
        <PageHeader title={t('compare.title')} />
        <Card className="gap-0 overflow-hidden p-0">{controls}</Card>
        <Card>
          <EmptyState icon={Scale} title={t('compare.sameProject')} />
        </Card>
      </>
    )
  }

  return <CompareBody sideA={sideA} sideB={sideB} controls={controls} basisKey={basisKey} setBasis={setBasis} t={t} lang={lang} phaseName={phaseName} />
}

function CompareBody({
  sideA, sideB, controls, basisKey, setBasis, t, lang, phaseName,
}: {
  sideA: Side
  sideB: Side
  controls: React.ReactNode
  basisKey: 'total' | 'sqft'
  setBasis: (v: string) => void
  t: ReturnType<typeof useApp>['t']
  lang: ReturnType<typeof useApp>['lang']
  phaseName: ReturnType<typeof useApp>['phaseName']
}) {
  const nameA = sideA.project.name
  const nameB = sideB.project.name
  const areaBasis = perAreaBasis(sideA.project, sideB.project)
  const perArea = basisKey === 'sqft' && areaBasis !== undefined
  const basis = perArea ? areaBasis : TOTALS
  const fmt = (n: number): string => (perArea ? t('compare.perSqft', { amount: moneyRate(n) }) : money(n))
  const today = todayISO()
  const [phaseSort, setPhaseSort] = useState<PhaseSort>('order')

  const sumA = summarizeSide(sideA)
  const sumB = summarizeSide(sideB)
  const paceA = useMemo(() => paceSeries(sideA, today, basis.divA), [sideA, today, basis.divA])
  const paceB = useMemo(() => paceSeries(sideB, today, basis.divB), [sideB, today, basis.divB])
  const pace = comparePace(paceA, paceB)

  const phaseRows = useMemo(() => comparePhases(sideA, sideB, basis), [sideA, sideB, basis])
  const catRows = useMemo(() => compareCategories(sideA, sideB, basis), [sideA, sideB, basis])
  const insights = useMemo(() => phaseInsights(phaseRows, 2), [phaseRows])
  const materials = useMemo(() => compareMaterials(sideA.payments, sideB.payments), [sideA.payments, sideB.payments])

  // A project with a phase that is not complete is still being built: totals and unfinished phases are "so far", not a verdict.
  const unfinishedA = sideA.phases.some((p) => !p.deletedAt && !p.done)
  const unfinishedB = sideB.phases.some((p) => !p.deletedAt && !p.done)
  const anyUnfinished = unfinishedA || unfinishedB

  const phaseBars: BarRow[] = sortPhaseRows(phaseRows, phaseSort).map((r) => {
    const openB = r.id !== NO_PHASE && r.inB && !r.doneB
    const openA = r.id !== NO_PHASE && r.inA && !r.doneA
    return {
      key: r.id,
      label: r.phase ? phaseName(r.phase) : t('reports.noPhase'),
      a: r.a,
      b: r.b,
      soFar: openB || openA || (r.id === NO_PHASE && anyUnfinished),
      note: !r.inA
        ? t('compare.onlyIn', { name: t('compare.projectB') })
        : !r.inB
          ? t('compare.onlyIn', { name: t('compare.projectA') })
          : openB
            ? t(r.b > 0 ? 'compare.notDoneB' : 'compare.notStartedB')
            : openA
              ? t('compare.notDoneA')
              : undefined,
    }
  })
  const catBars: BarRow[] = catRows.map((r) => ({ key: r.category, label: t(`cat.${r.category}` as Key), a: r.a, b: r.b, soFar: anyUnfinished }))
  const rateRows: RateRow[] = materials.map((m) => ({ key: m.key, label: m.item, unit: t(`unit.${m.unit}` as Key), from: moneyRate(m.rateA), to: moneyRate(m.rateB), pct: m.pct }))

  const sqft = (n: number | undefined) => (n ? t('compare.sqft', { n: num(n) }) : '—')
  const date = (d: string | undefined) => (d ? formatDate(d, lang) : '—')
  const spentDelta = delta(sumA.spent, sumB.spent)

  // Keep the most useful figures in one aligned table so both projects can be scanned row by row.
  const metrics: { label: string; a: string; b: string; d?: Delta; money?: boolean }[] = [
    { label: t('compare.spent'), a: money(sumA.spent), b: money(sumB.spent), d: spentDelta, money: true },
    ...(sumA.perArea !== undefined && sumB.perArea !== undefined
      ? [{ label: t('compare.perArea'), a: t('compare.perSqft', { amount: moneyRate(sumA.perArea) }), b: t('compare.perSqft', { amount: moneyRate(sumB.perArea) }), d: delta(sumA.perArea, sumB.perArea) }]
      : []),
    { label: t('compare.budget'), a: sumA.budget ? money(sumA.budget) : '—', b: sumB.budget ? money(sumB.budget) : '—' },
    ...(sumA.plotCost || sumB.plotCost ? [{ label: t('compare.plotCost'), a: sumA.plotCost ? money(sumA.plotCost) : '—', b: sumB.plotCost ? money(sumB.plotCost) : '—' }] : []),
    { label: t('compare.area'), a: sqft(sumA.area), b: sqft(sumB.area) },
    { label: t('compare.started'), a: date(sumA.start), b: date(sumB.start) },
  ]

  const pacePct = pace && pace.a > 0 ? delta(pace.a, pace.b).pct : undefined
  const heroWord = pacePct === undefined ? undefined : pacePct === 0 ? 'same' : pacePct > 0 ? 'more' : 'less'
  const printDelta = (d: Delta | undefined, soFar = false): string => {
    if (!d || Math.abs(d.delta) < 0.5) return d ? t('compare.same') : '—'
    const word = d.delta > 0 ? t('compare.more') : t('compare.less')
    const label = soFar ? t('compare.soFar', { word }) : word
    return `${label}${d.pct === undefined ? '' : ` ${Math.abs(d.pct)}%`}`
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={t('compare.title')}
          actions={
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              {t('compare.print')}
            </Button>
          }
        />
      </div>
      <Card className="gap-0 overflow-hidden p-0 print:hidden">
        {controls}

        {/* The high-level comparison and chart sit before the continuous tables below. */}
        {pace && pacePct !== undefined && heroWord && (
          <section className="grid gap-3 p-3 sm:p-4">
            <div className="grid gap-1">
              <p className="text-sm font-medium text-muted-foreground">{t('compare.heroTitle', { month: pace.month + 1 })}</p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="flex items-center gap-2 text-4xl leading-none font-extrabold tracking-tight sm:text-5xl">
                  {heroWord === 'more' ? <TrendingUp aria-hidden="true" className="size-9 text-danger" /> : heroWord === 'less' ? <TrendingDown aria-hidden="true" className="size-9 text-success" /> : null}
                  <bdi>{pacePct === 0 ? '0%' : `${Math.abs(pacePct)}%`}</bdi>
                </p>
                <p className="text-lg font-semibold">{t(heroWord === 'more' ? 'compare.heroMore' : heroWord === 'less' ? 'compare.heroLess' : 'compare.heroSame')}</p>
              </div>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2 sm:gap-x-8">
              <div className="flex items-center justify-between gap-3">
                <dt><KeyChip side="a">{t('compare.projectA')}</KeyChip></dt>
                <dd className="tabular font-bold">{fmt(pace.a)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt><KeyChip side="b">{t('compare.projectB')}</KeyChip></dt>
                <dd className="tabular font-bold">{fmt(pace.b)}</dd>
              </div>
            </dl>
            {(insights.higher.length > 0 || insights.lower.length > 0) && (
              <div className="grid gap-3 border-t pt-3 md:grid-cols-2 md:gap-6">
                {([['higher', insights.higher, TrendingUp, 'compare.higher'], ['lower', insights.lower, TrendingDown, 'compare.lower']] as const).map(([k, list, Icon, title]) => (
                  <section key={k} aria-label={t(title)} className="grid content-start gap-1.5">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Icon aria-hidden="true" className={cn('size-4', k === 'higher' ? 'text-danger' : 'text-success')} />
                      {t(title)}
                    </h3>
                    {list.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('compare.noneHere')}</p>
                    ) : (
                      <ul className="grid gap-1">
                        {list.map(({ row, d }) => (
                          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                            <span className="min-w-0 font-medium">{row.phase ? phaseName(row.phase) : ''}</span>
                            <span className={cn('tabular', k === 'higher' ? 'text-danger' : 'text-success')}>
                              <bdi>
                                {d.delta > 0 ? '+' : '-'}
                                {fmt(Math.abs(d.delta))}
                                {d.pct !== undefined ? ` (${pctText(d.pct)})` : ''}
                              </bdi>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            )}
          </section>
        )}

        {pace && (
          <section className="border-t">
            <div className="px-4 pt-3">
              <CardHeading icon={Timer} className={COMPACT_HEADING}>{t('compare.paceTitle')}</CardHeading>
            </div>
            <Legend className="mt-2 px-4" />
            <div className="mt-2 px-4 pb-3"><PaceChart a={paceA} b={paceB} format={fmt} /></div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/15 px-4 py-2 sm:px-5">
          <span className="text-sm font-semibold">{t('compare.basis')}</span>
          <ViewTabs
            label={t('compare.basis')}
            value={perArea ? 'sqft' : 'total'}
            onValueChange={setBasis}
            tabs={[
              { value: 'total', label: t('compare.basisTotal') },
              { value: 'sqft', label: t('compare.basisArea'), disabled: areaBasis === undefined },
            ]}
          />
          {areaBasis === undefined && <span className="text-sm text-muted-foreground">{t('compare.noArea')}</span>}
        </div>
        <div className="px-4 py-2 sm:px-4">
          <CardHeading icon={Scale} className={COMPACT_HEADING}>{t('compare.summary')}</CardHeading>
        </div>
        <div role="table" aria-label={t('compare.summary')}>
          <div role="row" className={cn('grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-b bg-muted/40 text-sm font-semibold', COMPARE_GRID)}>
            <span aria-hidden="true" className="px-3 py-2 sm:px-4" />
            <span role="columnheader" className="min-w-0 border-s px-3 py-2 sm:px-4">
              <KeyChip side="a">{nameA}</KeyChip>
            </span>
            <span role="columnheader" className="min-w-0 border-s px-3 py-2 sm:px-4">
              <KeyChip side="b">{nameB}</KeyChip>
            </span>
            <span role="columnheader" className="hidden border-s px-4 py-2 text-muted-foreground sm:block">{t('compare.difference')}</span>
          </div>
          {metrics.map((m) => (
            <div key={m.label} role="row" className={cn('grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-b last:border-b-0', COMPARE_GRID)}>
              <span role="rowheader" className="px-3 py-2 text-sm font-medium text-muted-foreground sm:px-4">{m.label}</span>
              <span role="cell" className="tabular min-w-0 border-s px-3 py-2 text-sm font-semibold break-words sm:px-4 sm:text-base">{m.a}</span>
              <span role="cell" className="tabular min-w-0 border-s px-3 py-2 text-sm font-semibold break-words sm:px-4 sm:text-base">{m.b}</span>
              <span role="cell" className="hidden min-w-28 border-s px-4 py-2 sm:block">
                {m.d ? <DeltaBadge d={m.d} format={m.money ? money : moneyRate} soFar={anyUnfinished} /> : <span className="text-muted-foreground">—</span>}
              </span>
            </div>
          ))}
        </div>

        <section className="border-t">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <CardHeading icon={Layers3} className={COMPACT_HEADING}>{t('compare.byPhase')}</CardHeading>
          <ViewTabs
            label={t('compare.sortBy')}
            value={phaseSort}
            onValueChange={(v) => setPhaseSort(v as PhaseSort)}
            tabs={[
              { value: 'order', label: t('compare.sortOrder') },
              { value: 'difference', label: t('compare.sortDiff') },
            ]}
          />
        </div>
          {phaseBars.length === 0 ? <p className="px-4 pb-3 text-muted-foreground">{t('reports.noData')}</p> : <CompareBars rows={phaseBars} format={fmt} flush />}
        </section>

        <section className="border-t">
        <div className="px-4 py-2.5"><CardHeading icon={Tags} className={COMPACT_HEADING}>{t('compare.byCategory')}</CardHeading></div>
          {catBars.length === 0 ? <p className="px-4 pb-3 text-muted-foreground">{t('reports.noData')}</p> : <CompareBars rows={catBars} format={fmt} flush />}
        </section>

        <section className="border-t">
        <div className="px-4 py-2.5">
          <CardHeading icon={Package} className={COMPACT_HEADING}>{t('compare.materials')}</CardHeading>
        </div>
        {materials.length === 0 ? (
          <p className="mx-4 mb-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm leading-5 text-muted-foreground">
            {t('compare.noMaterials')}
          </p>
          ) : <RateChangeBars rows={rateRows} flush />}
        </section>

      </Card>

      <section className="comparison-print hidden print:block">
        <header className="comparison-print__header">
          <p className="comparison-print__brand">EndPoint Construction</p>
          <h1>{t('compare.printTitle')}</h1>
          <p>{nameA} · {t('compare.projectA')} &nbsp; | &nbsp; {nameB} · {t('compare.projectB')}</p>
          <p className="comparison-print__muted">{t('compare.prepared', { date: formatDate(today, lang) })}</p>
        </header>

        {pace && pacePct !== undefined && heroWord && (
          <section className="comparison-print__result">
            <p className="comparison-print__eyebrow">{t('compare.heroTitle', { month: pace.month + 1 })}</p>
            <h2>
              {pacePct === 0 ? '0%' : `${Math.abs(pacePct)}%`} {t(heroWord === 'more' ? 'compare.heroMore' : heroWord === 'less' ? 'compare.heroLess' : 'compare.heroSame')}
            </h2>
            <div className="comparison-print__result-grid">
              <p><strong>{nameA}</strong><span>{fmt(pace.a)}</span></p>
              <p><strong>{nameB}</strong><span>{fmt(pace.b)}</span></p>
            </div>
          </section>
        )}

        <section className="comparison-print__section">
          <h2>{t('compare.summary')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('compare.details')}</th>
                <th>{nameA}</th>
                <th>{nameB}</th>
                <th>{t('compare.difference')}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.label}>
                  <th scope="row">{m.label}</th>
                  <td>{m.a}</td>
                  <td>{m.b}</td>
                  <td>{printDelta(m.d, anyUnfinished)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="comparison-print__section">
          <h2>{t('compare.byPhase')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('compare.byPhase')}</th>
                <th>{nameA}</th>
                <th>{nameB}</th>
                <th>{t('compare.difference')}</th>
              </tr>
            </thead>
            <tbody>
              {phaseBars.map((row) => {
                const d = delta(row.a, row.b)
                return (
                  <tr key={row.key}>
                    <th scope="row">{row.label}{row.note ? <small>{row.note}</small> : null}</th>
                    <td>{row.a > 0 ? fmt(row.a) : '—'}</td>
                    <td>{row.b > 0 ? fmt(row.b) : '—'}</td>
                    <td>{printDelta(d, row.soFar)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section className="comparison-print__section">
          <h2>{t('compare.byCategory')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('compare.byCategory')}</th>
                <th>{nameA}</th>
                <th>{nameB}</th>
                <th>{t('compare.difference')}</th>
              </tr>
            </thead>
            <tbody>
              {catBars.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td>{row.a > 0 ? fmt(row.a) : '—'}</td>
                  <td>{row.b > 0 ? fmt(row.b) : '—'}</td>
                  <td>{printDelta(delta(row.a, row.b), row.soFar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {rateRows.length > 0 && (
          <section className="comparison-print__section">
            <h2>{t('compare.materials')}</h2>
            <table>
              <thead>
                <tr>
                  <th>{t('compare.materials')}</th>
                  <th>{nameA}</th>
                  <th>{nameB}</th>
                  <th>{t('compare.difference')}</th>
                </tr>
              </thead>
              <tbody>
                {rateRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}<small>{row.unit}</small></th>
                    <td>{row.from}</td>
                    <td>{row.to}</td>
                    <td>{row.pct === undefined ? '—' : row.pct === 0 ? t('compare.same') : `${row.pct > 0 ? t('compare.more') : t('compare.less')} ${Math.abs(row.pct)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </section>
    </>
  )
}
