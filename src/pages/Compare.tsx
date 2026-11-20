import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { CompareBars, KeyChip, Legend, PaceChart, RateChangeBars, StatTile, type BarRow, type RateRow } from '@/components/CompareParts'
import { EmptyState, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dropdown } from '@/components/ui/dropdown'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { useMaterials, usePayments, usePhases } from '@/db/hooks'
import type { Key } from '@/i18n/en'
import {
  averageRateChange, comparePace, comparePhases, compareCategories, compareMaterials, delta, NO_PHASE, paceSeries, perAreaBasis, phaseInsights, sortPhaseRows, summarizeSide, TOTALS,
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
  const matA = useMaterials(aId)
  const matB = useMaterials(bId)

  const sideA = useMemo<Side | undefined>(() => (A ? { project: A, payments: payA, phases: phA, materials: matA } : undefined), [A, payA, phA, matA])
  const sideB = useMemo<Side | undefined>(() => (B ? { project: B, payments: payB, phases: phB, materials: matB } : undefined), [B, payB, phB, matB])

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
    <Card className="gap-4 p-4">
      <p className="text-muted-foreground">{t('compare.intro')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {([['a', t('compare.projectA'), aId], ['b', t('compare.projectB'), bId]] as const).map(([side, label, value]) => (
          <div key={side} className="grid gap-1.5">
            <span className="text-sm font-semibold">
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
    </Card>
  )

  if (!sideA || !sideB || sideA.project.id === sideB.project.id) {
    return (
      <>
        <PageHeader title={t('compare.title')} />
        {controls}
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
  const materials = useMemo(() => compareMaterials(sideA.materials, sideB.materials), [sideA.materials, sideB.materials])
  const rateChange = averageRateChange(materials)

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
  const labelWidth = perArea ? '9.5rem' : '8rem'

  const sqft = (n: number | undefined) => (n ? t('compare.sqft', { n: num(n) }) : '—')
  const monthsText = (n: number) => (n > 0 ? t('compare.months', { n }) : '—')
  const date = (d: string | undefined) => (d ? formatDate(d, lang) : '—')
  const spentDelta = delta(sumA.spent, sumB.spent)
  const usedA = sumA.budget ? Math.round((sumA.spent / sumA.budget) * 100) : undefined
  const usedB = sumB.budget ? Math.round((sumB.spent / sumB.budget) * 100) : undefined

  // The full list of figures, for the "All figures" section at the end.
  const metrics: { label: string; a: string; b: string; d?: Delta; money?: boolean }[] = [
    { label: t('compare.spent'), a: money(sumA.spent), b: money(sumB.spent), d: spentDelta, money: true },
    ...(sumA.perArea !== undefined && sumB.perArea !== undefined
      ? [{ label: t('compare.perArea'), a: t('compare.perSqft', { amount: moneyRate(sumA.perArea) }), b: t('compare.perSqft', { amount: moneyRate(sumB.perArea) }), d: delta(sumA.perArea, sumB.perArea) }]
      : []),
    { label: t('compare.budget'), a: sumA.budget ? money(sumA.budget) : '—', b: sumB.budget ? money(sumB.budget) : '—' },
    { label: t('compare.area'), a: sqft(sumA.area), b: sqft(sumB.area) },
    { label: t('compare.started'), a: date(sumA.start), b: date(sumB.start) },
    { label: t('compare.duration'), a: monthsText(paceA.length), b: monthsText(paceB.length) },
  ]

  const pacePct = pace && pace.a > 0 ? delta(pace.a, pace.b).pct : undefined
  const heroWord = pacePct === undefined ? undefined : pacePct === 0 ? 'same' : pacePct > 0 ? 'more' : 'less'

  return (
    <>
      <PageHeader title={t('compare.title')} />
      {controls}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">{t('compare.basis')}</span>
        <PillRadioGroup aria-label={t('compare.basis')} value={perArea ? 'sqft' : 'total'} onValueChange={setBasis}>
          <PillRadioItem value="total">{t('compare.basisTotal')}</PillRadioItem>
          <PillRadioItem value="sqft" disabled={areaBasis === undefined}>
            {t('compare.basisArea')}
          </PillRadioItem>
        </PillRadioGroup>
        {areaBasis === undefined && <span className="text-sm text-muted-foreground">{t('compare.noArea')}</span>}
      </div>

      {/* The answer first: how this project stands at the same stage, then what differs most. */}
      {pace && pacePct !== undefined && heroWord && (
        <Card className="gap-5 p-5">
          <div className="grid gap-1">
            <p className="text-sm font-medium text-muted-foreground">{t('compare.heroTitle', { month: pace.month + 1 })}</p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="flex items-center gap-2 text-5xl leading-none font-extrabold tracking-tight">
                {heroWord === 'more' ? <TrendingUp aria-hidden="true" className="size-9 text-warning" /> : heroWord === 'less' ? <TrendingDown aria-hidden="true" className="size-9 text-success" /> : null}
                <bdi>{pacePct === 0 ? '0%' : `${Math.abs(pacePct)}%`}</bdi>
              </p>
              <p className="text-lg font-semibold">{t(heroWord === 'more' ? 'compare.heroMore' : heroWord === 'less' ? 'compare.heroLess' : 'compare.heroSame')}</p>
            </div>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2 sm:gap-x-8">
            <div className="flex items-center justify-between gap-3">
              <dt>
                <KeyChip side="a">{t('compare.projectA')}</KeyChip>
              </dt>
              <dd className="tabular font-bold">{fmt(pace.a)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>
                <KeyChip side="b">{t('compare.projectB')}</KeyChip>
              </dt>
              <dd className="tabular font-bold">{fmt(pace.b)}</dd>
            </div>
          </dl>
          {(insights.higher.length > 0 || insights.lower.length > 0) && (
            <div className="grid gap-4 border-t pt-4 md:grid-cols-2 md:gap-8">
              {([['higher', insights.higher, TrendingUp, 'compare.higher'], ['lower', insights.lower, TrendingDown, 'compare.lower']] as const).map(([k, list, Icon, title]) => (
                <section key={k} aria-label={t(title)} className="grid content-start gap-1.5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon aria-hidden="true" className="size-4" />
                    {t(title)}
                  </h3>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('compare.noneHere')}</p>
                  ) : (
                    <ul className="grid gap-1">
                      {list.map(({ row, d }) => (
                        <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                          <span className="min-w-0 font-medium">{row.phase ? phaseName(row.phase) : ''}</span>
                          <span className="tabular text-muted-foreground">
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
        </Card>
      )}

      {/* The key numbers, two values each. */}
      <Legend />
      <section aria-label={t('compare.summary')} className="-mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('compare.spent')} a={money(sumA.spent)} b={money(sumB.spent)} d={spentDelta} format={money} soFar={anyUnfinished} />
        {sumA.perArea !== undefined && sumB.perArea !== undefined && (
          <StatTile
            label={t('compare.perArea')}
            a={t('compare.perSqft', { amount: moneyRate(sumA.perArea) })}
            b={t('compare.perSqft', { amount: moneyRate(sumB.perArea) })}
            d={delta(sumA.perArea, sumB.perArea)}
            format={moneyRate}
            soFar={anyUnfinished}
          />
        )}
        {usedA !== undefined && usedB !== undefined && <StatTile label={t('compare.budgetUsed')} a={`${usedA}%`} b={`${usedB}%`} format={money} note={t('compare.budgetUsedNote')} />}
        {rateChange !== undefined && (
          <Card className="gap-3 p-4">
            <p className="text-sm font-medium text-muted-foreground">{t('compare.matChange')}</p>
            <p className="flex items-center gap-2 text-3xl leading-none font-extrabold">
              {rateChange > 0 ? <TrendingUp aria-hidden="true" className="size-6 text-warning" /> : rateChange < 0 ? <TrendingDown aria-hidden="true" className="size-6 text-success" /> : null}
              <bdi>{rateChange === 0 ? '0%' : `${Math.abs(rateChange)}%`}</bdi>
            </p>
            <p className="text-sm font-semibold">{rateChange > 0 ? t('compare.more') : rateChange < 0 ? t('compare.less') : t('compare.same')}</p>
            <p className="text-sm text-muted-foreground">{t('compare.matChangeNote', { count: materials.length })}</p>
          </Card>
        )}
      </section>

      {pace && (
        <Card className="gap-4 p-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold">{t('compare.paceTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('compare.paceSub')}</p>
          </div>
          <Legend />
          <PaceChart a={paceA} b={paceB} format={fmt} />
        </Card>
      )}

      <Card className="gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold">{t('compare.byPhase')}</h2>
            <p className="text-sm text-muted-foreground">{perArea ? t('compare.basisArea') : t('compare.basisTotal')}</p>
          </div>
          <PillRadioGroup aria-label={t('compare.sortBy')} value={phaseSort} onValueChange={(v) => setPhaseSort(v as PhaseSort)}>
            <PillRadioItem value="order">{t('compare.sortOrder')}</PillRadioItem>
            <PillRadioItem value="difference">{t('compare.sortDiff')}</PillRadioItem>
          </PillRadioGroup>
        </div>
        <Legend />
        {phaseBars.length === 0 ? <p className="text-muted-foreground">{t('reports.noData')}</p> : <CompareBars rows={phaseBars} format={fmt} labelWidth={labelWidth} />}
      </Card>

      <Card className="gap-4 p-4">
        <h2 className="text-lg font-semibold">{t('compare.byCategory')}</h2>
        <Legend />
        {catBars.length === 0 ? <p className="text-muted-foreground">{t('reports.noData')}</p> : <CompareBars rows={catBars} format={fmt} labelWidth={labelWidth} />}
      </Card>

      <Card className="gap-4 p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">{t('compare.materials')}</h2>
          <p className="text-sm text-muted-foreground">{t('compare.materialsNote')}</p>
        </div>
        {materials.length === 0 ? <p className="text-muted-foreground">{t('compare.noMaterials')}</p> : <RateChangeBars rows={rateRows} />}
      </Card>

      <Card className="p-0">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-lg font-semibold">
            {t('compare.details')}
            <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <div className="px-4 pb-4">
            <div role="table" aria-label={t('compare.details')} className="hidden sm:grid">
              <div role="row" className="grid grid-cols-[10rem_1fr_1fr] gap-x-3 border-b pb-2 text-sm font-semibold">
                <span aria-hidden="true" />
                <span role="columnheader" className="break-words">
                  <KeyChip side="a">{nameA}</KeyChip>
                </span>
                <span role="columnheader" className="break-words">
                  <KeyChip side="b">{nameB}</KeyChip>
                </span>
              </div>
              {metrics.map((m) => (
                <div key={m.label} role="row" className="grid grid-cols-[10rem_1fr_1fr] items-start gap-x-3 border-b py-2.5 last:border-b-0">
                  <span role="rowheader" className="text-sm text-muted-foreground">
                    {m.label}
                  </span>
                  <span role="cell" className="tabular text-sm font-semibold whitespace-nowrap">
                    {m.a}
                  </span>
                  <span role="cell" className="tabular text-sm font-semibold whitespace-nowrap">
                    {m.b}
                  </span>
                </div>
              ))}
            </div>
            <dl className="grid sm:hidden">
              {metrics.map((m) => (
                <div key={m.label} className="grid gap-1.5 border-b py-3 last:border-b-0">
                  <dt className="text-sm font-semibold">{m.label}</dt>
                  <dd className="flex items-baseline justify-between gap-3">
                    <KeyChip side="a">{t('compare.projectA')}</KeyChip>
                    <span className="tabular font-semibold whitespace-nowrap">{m.a}</span>
                  </dd>
                  <dd className="flex items-baseline justify-between gap-3">
                    <KeyChip side="b">{t('compare.projectB')}</KeyChip>
                    <span className="tabular font-semibold whitespace-nowrap">{m.b}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
      </Card>

      <p className="text-sm text-muted-foreground">{t('compare.note')}</p>
    </>
  )
}
