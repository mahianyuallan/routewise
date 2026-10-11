import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircleIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import type { Place, PlanRequest } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { browserTimeZone, nextFullHourLocal } from '@/lib/format'

import { PlaceCombobox } from './PlaceCombobox'

const MAX_LOAD_LB = 45_000
const SPACING_OPTIONS = [10, 25, 50] as const

const placeSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  timezone: z.string().nullable(),
})

const schema = z
  .object({
    origin: placeSchema.nullable().refine((p): p is Place => p !== null, 'Pick an origin'),
    destination: placeSchema.nullable().refine((p): p is Place => p !== null, 'Pick a destination'),
    departure_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Pick a departure date and time'),
    load_lb: z
      .number({ error: 'Enter the cargo weight in pounds' })
      .int('Whole pounds only')
      .min(0, 'Load can’t be negative')
      .max(MAX_LOAD_LB, `Load is cargo weight, at most ${MAX_LOAD_LB.toLocaleString('en-US')} lb`),
    spacing_miles: z.union([z.literal(10), z.literal(25), z.literal(50)]),
  })
  .refine(
    (v) =>
      !v.origin || !v.destination || v.origin.lat !== v.destination.lat || v.origin.lon !== v.destination.lon,
    { message: 'Origin and destination are the same place', path: ['destination'] },
  )

/** What the fields hold while editing (places may still be empty). */
type FormInput = z.input<typeof schema>
/** What validation hands to submit: both places picked. */
type FormOutput = z.output<typeof schema>

interface Props {
  onPlan: (trip: PlanRequest) => void
  planning: boolean
}

export function TripForm({ onPlan, planning }: Props) {
  const { register, control, handleSubmit, formState, setValue } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      origin: null,
      destination: null,
      departure_local: nextFullHourLocal(browserTimeZone()),
      load_lb: 20_000,
      spacing_miles: 25,
    },
  })
  const { errors, dirtyFields } = formState
  const origin = useWatch({ control, name: 'origin' })

  // Departure is wall-clock time at the origin: once an origin is picked, default to the next
  // full hour there, unless the driver already typed a time.
  useEffect(() => {
    if (origin?.timezone && !dirtyFields.departure_local) {
      setValue('departure_local', nextFullHourLocal(origin.timezone), { shouldDirty: false })
    }
  }, [origin, dirtyFields.departure_local, setValue])

  const submit = handleSubmit((values) => {
    const toPlace = (place: Place) => ({
      label: place.label,
      lat: place.lat,
      lon: place.lon,
      timezone: place.timezone,
    })
    onPlan({
      origin: toPlace(values.origin),
      destination: toPlace(values.destination),
      departure_local: values.departure_local,
      load_lb: values.load_lb,
      spacing_miles: values.spacing_miles,
      weather_source: 'forecast',
    })
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan a trip</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="origin">Origin</Label>
            <Controller
              control={control}
              name="origin"
              render={({ field }) => (
                <PlaceCombobox
                  id="origin"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Where the truck leaves from"
                  invalid={!!errors.origin}
                />
              )}
            />
            <FieldError message={errors.origin?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination">Destination</Label>
            <Controller
              control={control}
              name="destination"
              render={({ field }) => (
                <PlaceCombobox
                  id="destination"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Where it's going"
                  invalid={!!errors.destination}
                />
              )}
            />
            <FieldError message={errors.destination?.message} />
            <p className="text-xs text-muted-foreground">
              US places only.{' '}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="https://www.geoapify.com/"
                target="_blank"
                rel="noreferrer"
              >
                Powered by Geoapify
              </a>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="departure">
              Departure{origin?.timezone ? ` (local time at ${origin.label.split(',')[0]})` : ''}
            </Label>
            <Input
              id="departure"
              type="datetime-local"
              step={60}
              aria-invalid={!!errors.departure_local || undefined}
              {...register('departure_local')}
            />
            <FieldError message={errors.departure_local?.message} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="load">Load (lb)</Label>
              <Input
                id="load"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_LOAD_LB}
                step={500}
                aria-invalid={!!errors.load_lb || undefined}
                {...register('load_lb', { valueAsNumber: true })}
              />
              <FieldError message={errors.load_lb?.message} />
            </div>
            <div className="space-y-1.5">
              <Label id="spacing-label">Checkpoint every</Label>
              <Controller
                control={control}
                name="spacing_miles"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    aria-labelledby="spacing-label"
                    value={String(field.value)}
                    onValueChange={(v) => v && field.onChange(Number(v))}
                    className="w-full"
                  >
                    {SPACING_OPTIONS.map((miles) => (
                      <ToggleGroupItem key={miles} value={String(miles)} className="flex-1">
                        {miles} mi
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={planning}>
            {planning ? (
              <>
                <LoaderCircleIcon className="animate-spin" /> Planning…
              </>
            ) : (
              'Plan routes'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null
}
