import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Loader2 } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { BrandLogo } from '@/components/Brand'
import { BackLink, Field, GroupField, PageHeader } from '@/components/common'
import { FileDropzone } from '@/components/FileDropzone'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dropdown } from '@/components/ui/dropdown'
import { Switch } from '@/components/ui/switch'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { db } from '@/db/db'
import { createProject, PHASE_KEYS, updateProject, type PhaseTemplate } from '@/db/actions'
import type { Key } from '@/i18n/en'
import { groupDigits, money, moneyRate, parseAmount } from '@/lib/format'
import { compressImage, useObjectUrl } from '@/lib/image'
import { costSplit } from '@/lib/cost'
import { budgetPerSqft, plannedDays, plannedSpan } from '@/lib/project-plan'

/** One section of the form: a card with a title, a line saying what it is for, and the fields. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 py-5 max-sm:gap-3 max-sm:py-3.5">
      <CardHeader className="px-4 max-sm:gap-1 max-sm:px-3.5 sm:px-6">
        <CardTitle className="text-base max-sm:text-[0.9375rem]">
          <h2>{title}</h2>
        </CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4 px-4 max-sm:gap-3 max-sm:px-3.5 sm:px-6">{children}</CardContent>
    </Card>
  )
}

/** New project (zero state) or edit. Standalone page so it also works before any project exists. */
export function ProjectForm() {
  const { id } = useParams()
  const edit = Boolean(id)
  const { t, projects, can, phaseName } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const existing = useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [thumb, setThumb] = useState<Blob>()
  const [plot, setPlot] = useState('')
  const [area, setArea] = useState('')
  const [floors, setFloors] = useState('')
  const [start, setStart] = useState('')
  const [finish, setFinish] = useState('')
  const [budget, setBudget] = useState('')
  const [plotCost, setPlotCost] = useState('')
  // On a new project these are asked only when wanted; when editing they are always shown.
  const [moneyOpen, setMoneyOpen] = useState(false)
  const [template, setTemplate] = useState<'standard' | 'blank' | 'copy'>('standard')
  // The project whose phases are copied (first in the list until another is chosen).
  const [copyFrom, setCopyFrom] = useState('')
  const [nameMissing, setNameMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const url = useObjectUrl(thumb)

  useEffect(() => {
    if (!existing || loaded) return
    setLoaded(true)
    setName(existing.name)
    setLocation(existing.location)
    setThumb(existing.thumbnail)
    setPlot(existing.plotSize ?? '')
    setArea(existing.coveredArea ? String(existing.coveredArea) : '')
    setFloors(existing.floors ? String(existing.floors) : '')
    setStart(existing.startDate ?? '')
    setFinish(existing.targetFinish ?? '')
    setBudget(existing.budget ? groupDigits(String(existing.budget)) : '')
    setPlotCost(existing.plotCost ? groupDigits(String(existing.plotCost)) : '')
  }, [existing, loaded])

  // The phases of the project that would be copied, as a preview.
  const sourceId = copyFrom && projects.some((p) => p.id === copyFrom) ? copyFrom : (projects[0]?.id ?? '')
  const sourcePhases = useLiveQuery(
    async () => (sourceId ? (await db.phases.where('projectId').equals(sourceId).toArray()).filter((p) => !p.deletedAt).sort((a, b) => a.order - b.order) : []),
    [sourceId],
  )

  const cancelTo = edit ? '/projects' : projects.length > 0 ? '/projects' : '/welcome'

  // Figures worked out while typing, so the numbers can be checked before saving.
  const perSqft = budgetPerSqft(parseAmount(budget), Number(area))
  const split = costSplit(parseAmount(plotCost), 0, parseAmount(budget))
  const days = plannedDays(start, finish)
  const span = days === undefined ? undefined : plannedSpan(days)
  const showMoney = edit || moneyOpen
  const finishError = showMoney && start && finish && days === undefined ? t('pf.finishBefore') : ''
  const spanText = !span
    ? ''
    : 'days' in span
      ? t('pf.spanDays', { n: span.days })
      : t(span.months === 1 ? 'pf.spanMonth' : 'pf.spanMonths', { n: span.months })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) {
      setNameMissing(true)
      nameRef.current?.focus()
      return
    }
    if (finishError) return
    setBusy(true)
    try {
      const data = {
        name: name.trim(),
        location: location.trim(),
        thumbnail: thumb,
        // A replaced photo has to be uploaded again.
        thumbnailPath: edit && thumb && thumb === existing?.thumbnail ? existing?.thumbnailPath : undefined,
        plotSize: plot.trim() || undefined,
        coveredArea: area ? Number(area) : undefined,
        floors: floors ? Number(floors) : undefined,
        startDate: showMoney ? start || undefined : undefined,
        targetFinish: showMoney ? finish || undefined : undefined,
        budget: showMoney ? parseAmount(budget) || undefined : undefined,
        // null (not undefined) clears a plot cost that was saved before, so the other phone hears about it too.
        plotCost: showMoney ? parseAmount(plotCost) || (edit && existing?.plotCost ? null : undefined) : undefined,
      }
      if (edit && id) {
        await updateProject(id, data)
      } else {
        const chosen: PhaseTemplate = template === 'copy' && sourceId ? { copyFrom: sourceId } : template === 'blank' ? 'blank' : 'standard'
        await createProject(data, chosen)
        toast.show({ kind: 'success', message: t('pf.created') })
      }
      nav('/')
    } finally {
      setBusy(false)
    }
  }

  // Only an investor changes a project's details (the server holds the same rule). A builder who opens this address is told so.
  if (edit && id && !can('editProject', id)) {
    return (
      <main className="mx-auto grid w-full max-w-2xl gap-4 px-1 py-4 max-sm:px-3.5 sm:py-8">
        <BackLink to="/projects" label={t('common.back')} />
        <PageHeader title={t('pf.edit')} subtitle={t('perm.investorOnly')} />
      </main>
    )
  }

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-1 py-4 max-sm:gap-3 max-sm:px-3.5 max-sm:pt-3 max-sm:pb-0 max-sm:[&_h1]:text-lg max-sm:[&_h1+p]:text-[0.8125rem] sm:py-8">
      {!edit && projects.length === 0 && <BrandLogo className="h-auto w-28" alt={t('app.full')} />}
      <BackLink to={cancelTo} label={t('common.back')} />
      <PageHeader title={edit ? t('pf.edit') : t('pf.new')} subtitle={edit ? t('pf.editSub') : t('pf.newSub')} />

      <form className="grid gap-4 max-sm:gap-3 max-sm:[&_.text-sm]:text-[0.8125rem]" onSubmit={(e) => void submit(e)} noValidate>
        <Section title={t('pf.secBasics')}>
          <FileDropzone
            accept="image/*"
            title={t('pf.thumb')}
            hint={t('pf.thumbHint')}
            browseLabel={url ? t('pf.changeThumb') : t('pf.chooseThumb')}
            className="max-sm:[&>div:first-child]:gap-2.5 max-sm:[&>div:first-child]:px-2.5 max-sm:[&>div:first-child]:py-2.5 max-sm:[&_p]:text-xs max-sm:[&_p]:leading-snug max-sm:[&_button]:h-8 max-sm:[&_button]:px-3"
            onFiles={async (files) => setThumb(await compressImage(files[0], 1200))}
            lead={
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-primary max-sm:size-14 sm:size-28">
                {url ? <img src={url} alt="" className="size-full object-cover" /> : <Camera className="size-8" aria-hidden="true" />}
              </div>
            }
          />
          <Field label={t('pf.name')} error={nameMissing ? t('pf.nameRequired') : ''}>
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameMissing(false)
              }}
              autoFocus={!edit}
              autoComplete="off"
              placeholder={t('pf.namePlaceholder')}
            />
          </Field>
          <Field label={`${t('pf.location')} (${t('common.optional')})`}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} autoComplete="street-address" />
          </Field>
        </Section>

        <Section title={t('pf.secSize')} hint={t('pf.secSizeHint')}>
          <div className="grid items-start gap-4 max-sm:gap-3 sm:grid-cols-3">
            <Field label={t('pf.plot')} hint={t('pf.plotHint')}>
              <Input value={plot} onChange={(e) => setPlot(e.target.value)} />
            </Field>
            <Field label={t('pf.area')}>
              <Input inputMode="numeric" className="tabular" value={area} onChange={(e) => setArea(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label={t('pf.floors')}>
              <Input inputMode="numeric" className="tabular" value={floors} onChange={(e) => setFloors(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
        </Section>

        <Section title={t('pf.secMoney')} hint={edit || moneyOpen ? t('pf.secMoneyHint') : t('pf.moneyLater')}>
          {!edit && (
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 text-sm font-semibold">
              {t('pf.moneyToggle')}
              <Switch checked={moneyOpen} onCheckedChange={setMoneyOpen} />
            </label>
          )}
          {showMoney && (
            <>
              <Field label={`${t('pf.plotCost')} (${t('common.optional')})`} hint={t('pf.plotCostHint')}>
                <Input className="tabular" inputMode="numeric" value={plotCost} onChange={(e) => setPlotCost(groupDigits(e.target.value))} />
              </Field>
              <Field label={t('pf.budget')} hint={perSqft ? t('pf.perSqft', { rate: moneyRate(perSqft) }) : t('pf.budgetHint')}>
                <Input className="tabular" inputMode="numeric" value={budget} onChange={(e) => setBudget(groupDigits(e.target.value))} />
              </Field>
              {split?.totalPlanned !== undefined && (
                <p className="tabular flex items-baseline justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t('pf.totalPlanned')}</span>
                  <strong>{money(split.totalPlanned)}</strong>
                </p>
              )}
              <div className="grid items-start gap-4 max-sm:gap-3 sm:grid-cols-2">
                <Field label={t('pf.start')}>
                  <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </Field>
                <Field label={t('pf.finish')} error={finishError} hint={spanText || undefined}>
                  <Input type="date" value={finish} min={start || undefined} onChange={(e) => setFinish(e.target.value)} />
                </Field>
              </div>
            </>
          )}
        </Section>

        {!edit && (
          <Section title={t('pf.template')} hint={t('pf.templateHint')}>
            <GroupField label={t('pf.templateStart')}>
              {(labelId) => (
                <PillRadioGroup aria-labelledby={labelId} value={template} onValueChange={(v) => setTemplate(v as 'standard' | 'blank' | 'copy')}>
                  <PillRadioItem value="standard" className="max-sm:h-10 max-sm:px-3">{t('pf.templateStd')}</PillRadioItem>
                  {projects.length > 0 && <PillRadioItem value="copy" className="max-sm:h-10 max-sm:px-3">{t('pf.templateCopy')}</PillRadioItem>}
                  <PillRadioItem value="blank" className="max-sm:h-10 max-sm:px-3">{t('pf.templateBlank')}</PillRadioItem>
                </PillRadioGroup>
              )}
            </GroupField>
            {template === 'standard' ? (
              <ol className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label={t('pf.template')}>
                {PHASE_KEYS.map((key, i) => (
                  <li key={key} className="flex items-baseline gap-2 rounded-lg bg-muted/60 px-3 py-1.5 max-sm:py-1">
                    <span className="tabular w-5 shrink-0 text-muted-foreground">{i + 1}</span>
                    <span>{t(`phase.${key}` as Key)}</span>
                  </li>
                ))}
              </ol>
            ) : template === 'copy' ? (
              <>
                <Field label={t('pf.copyFrom')}>
                  <Dropdown value={sourceId} onChange={(e) => setCopyFrom(e.target.value)}>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Dropdown>
                </Field>
                {sourcePhases && sourcePhases.length > 0 ? (
                  <ol className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label={t('pf.copyFrom')}>
                    {sourcePhases.map((p, i) => (
                      <li key={p.id} className="flex items-baseline gap-2 rounded-lg bg-muted/60 px-3 py-1.5 max-sm:py-1">
                        <span className="tabular w-5 shrink-0 text-muted-foreground">{i + 1}</span>
                        <span>{phaseName(p)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('pf.copyNone')}</p>
                )}
                <p className="text-sm text-muted-foreground">{t('pf.copyNote')}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('pf.templateBlankHint')}</p>
            )}
          </Section>
        )}

        <div className="sticky bottom-0 z-10 -mx-3.5 flex justify-end gap-2 border-t bg-background px-3.5 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="button" variant="outline" className="max-sm:grow max-sm:basis-[calc(50%-0.25rem)]" onClick={() => nav(cancelTo)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={busy} className="max-sm:grow max-sm:basis-[calc(50%-0.25rem)]">
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {edit ? t('common.save') : t('pf.create')}
          </Button>
        </div>
      </form>
    </main>
  )
}
