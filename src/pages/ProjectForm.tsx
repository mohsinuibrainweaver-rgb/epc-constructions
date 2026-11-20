import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera } from 'lucide-react'
import { useApp } from '@/app/AppContext'
import { Field, GroupField } from '@/components/common'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PillRadioGroup, PillRadioItem } from '@/components/ui/pill-radio'
import { db } from '@/db/db'
import { createProject, updateProject } from '@/db/actions'
import { groupDigits, parseAmount } from '@/lib/format'
import { compressImage, useObjectUrl } from '@/lib/image'

/** New project (zero state) or edit. Standalone page so it also works before any project exists. */
export function ProjectForm() {
  const { id } = useParams()
  const edit = Boolean(id)
  const { t, projects } = useApp()
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
  const [template, setTemplate] = useState<'standard' | 'blank'>('standard')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
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
  }, [existing, loaded])

  const cancelTo = edit ? '/projects' : projects.length > 0 ? '/projects' : '/welcome'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('pf.nameRequired'))
      return
    }
    const data = {
      name: name.trim(),
      location: location.trim(),
      thumbnail: thumb,
      // A replaced photo has to be uploaded again.
      thumbnailPath: edit && thumb && thumb === existing?.thumbnail ? existing?.thumbnailPath : undefined,
      plotSize: plot.trim() || undefined,
      coveredArea: area ? Number(area) : undefined,
      floors: floors ? Number(floors) : undefined,
      startDate: start || undefined,
      targetFinish: finish || undefined,
      budget: parseAmount(budget) || undefined,
    }
    if (edit && id) {
      await updateProject(id, data)
    } else {
      await createProject(data, template)
      toast.show({ kind: 'success', message: t('pf.created') })
    }
    nav('/')
  }

  return (
    <main className="container-page mx-auto w-full max-w-3xl py-6">
      <form className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
        <h1 className="text-3xl font-semibold tracking-tight">{edit ? t('pf.edit') : t('pf.new')}</h1>

        <div className="grid gap-2">
          <span className="text-sm font-semibold">{t('pf.thumb')}</span>
          <div className="grid aspect-video max-w-sm place-items-center overflow-hidden rounded-xl bg-secondary text-primary">
            {url ? <img src={url} alt="" className="size-full object-cover" /> : <Camera className="size-8" aria-hidden="true" />}
          </div>
          <span className="text-sm text-muted-foreground">{t('pf.thumbHint')}</span>
          <Button asChild variant="outline" className="w-fit cursor-pointer">
            <label>
              {t('pf.chooseThumb')}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void compressImage(f, 1200).then(setThumb)
                }}
              />
            </label>
          </Button>
        </div>

        <Field label={t('pf.name')} error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!edit} autoComplete="off" />
        </Field>
        <Field label={t('pf.location')}>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} autoComplete="street-address" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pf.plot')} hint={t('pf.plotHint')}>
            <Input value={plot} onChange={(e) => setPlot(e.target.value)} />
          </Field>
          <Field label={t('pf.area')}>
            <Input inputMode="numeric" value={area} onChange={(e) => setArea(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label={t('pf.floors')}>
            <Input inputMode="numeric" value={floors} onChange={(e) => setFloors(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label={t('pf.budget')}>
            <Input className="tabular" inputMode="numeric" value={budget} onChange={(e) => setBudget(groupDigits(e.target.value))} />
          </Field>
          <Field label={t('pf.start')}>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t('pf.finish')}>
            <Input type="date" value={finish} onChange={(e) => setFinish(e.target.value)} />
          </Field>
        </div>

        {!edit && (
          <GroupField label={t('pf.template')}>
            {(labelId) => (
              <PillRadioGroup aria-labelledby={labelId} value={template} onValueChange={(v) => setTemplate(v as 'standard' | 'blank')}>
                <PillRadioItem value="standard">{t('pf.templateStd')}</PillRadioItem>
                <PillRadioItem value="blank">{t('pf.templateBlank')}</PillRadioItem>
              </PillRadioGroup>
            )}
          </GroupField>
        )}

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to={cancelTo}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit">{edit ? t('common.save') : t('pf.create')}</Button>
        </div>
      </form>
    </main>
  )
}
