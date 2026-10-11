import { CheckIcon, ChevronsUpDownIcon, MapPinIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { usePlaces } from '@/api/queries'
import type { Place } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/utils'

interface Props {
  id?: string
  value: Place | null
  onChange: (place: Place | null) => void
  placeholder: string
  invalid?: boolean
}

/** US place search: suggestions come from the API (Geoapify), each with coordinates and zone. */
export function PlaceCombobox({ id, value, onChange, placeholder, invalid }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const debounced = useDebouncedValue(text, 300)
  const places = usePlaces(debounced)
  const listId = useId()

  const typing = text.trim().length >= 3 && debounced !== text
  const searching = typing || places.isFetching

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPinIcon className="size-4 shrink-0 opacity-60" />
            <span className="truncate">{value ? value.label : placeholder}</span>
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          {/* 16px on phones: iOS Safari zooms into any smaller input and never zooms back out. */}
          <CommandInput
            placeholder="Type a city, address or place"
            value={text}
            onValueChange={setText}
            className="text-base md:text-sm"
          />
          <CommandList id={listId}>
            {text.trim().length < 3 ? (
              <CommandEmpty>Type at least 3 characters.</CommandEmpty>
            ) : places.isError ? (
              <CommandEmpty>Place search isn't available right now.</CommandEmpty>
            ) : searching && !places.data?.length ? (
              <CommandEmpty>Searching…</CommandEmpty>
            ) : !places.data?.length ? (
              <CommandEmpty>No US places match.</CommandEmpty>
            ) : (
              <CommandGroup>
                {places.data.map((place) => {
                  const selected = value?.lat === place.lat && value?.lon === place.lon
                  return (
                    <CommandItem
                      key={`${place.lat},${place.lon}`}
                      value={`${place.lat},${place.lon}`}
                      onSelect={() => {
                        onChange(place)
                        setOpen(false)
                      }}
                    >
                      <span className="truncate">{place.label}</span>
                      {selected && <CheckIcon className="ml-auto size-4" />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
