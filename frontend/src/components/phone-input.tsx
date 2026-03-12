import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import {
  COUNTRY_CODES,
  countryCodeToFlag,
  digitsOnly,
  parseCountryCode,
  validatePhoneE164,
} from "@/lib/phone.utils"

export interface PhoneInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string
  onChange: (value: string) => void
  /** Validation error message (from parent form) */
  error?: string
  defaultCountryCode?: string
}

function parseE164(phone: string, defaultDial = "34"): { dial: string; national: string } {
  const d = digitsOnly(phone)
  if (!d) return { dial: defaultDial, national: "" }
  const parsed = parseCountryCode(d)
  return parsed ?? { dial: defaultDial, national: d }
}

export function PhoneInput({
  value,
  onChange,
  error,
  defaultCountryCode = "34",
  className,
  ...props
}: PhoneInputProps) {
  const parsed = parseE164(value, defaultCountryCode)
  const [countryDial, setCountryDial] = React.useState(parsed.dial || defaultCountryCode)
  const [national, setNational] = React.useState(parsed.national)
  const [touched, setTouched] = React.useState(false)

  React.useEffect(() => {
    const p = parseE164(value, defaultCountryCode)
    setCountryDial(p.dial || defaultCountryCode)
    setNational(p.national)
  }, [value, defaultCountryCode])

  const emit = React.useCallback(
    (dial: string, nat: string) => {
      const country = COUNTRY_CODES.find((c) => c.dial === dial)
      if (country?.dial) {
        const full = `+${country.dial}${digitsOnly(nat)}`
        onChange(full)
      } else {
        onChange(nat.trim().startsWith("+") ? nat : `+${digitsOnly(nat)}`)
      }
    },
    [onChange]
  )

  const handleCountryChange = (dial: string) => {
    setCountryDial(dial)
    const country = COUNTRY_CODES.find((c) => c.dial === dial)
    if (country?.dial) {
      const p = parseE164(value, defaultCountryCode)
      const nat = p.dial === dial ? p.national : digitsOnly(value)
      setNational(nat)
      emit(dial, nat)
    } else if (dial === "_other") {
      setNational(digitsOnly(value))
      onChange(value || "")
    }
  }

  const handleNationalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "")
    setNational(v)
    const country = COUNTRY_CODES.find((c) => c.dial === countryDial)
    if (country?.dial) {
      emit(countryDial, v)
    }
  }

  const validation = validatePhoneE164(value)
  const showError = touched && (error || (!validation.valid && value))

  const [countryOpen, setCountryOpen] = React.useState(false)
  const isOther = countryDial === "_other"

  if (isOther) {
    return (
      <div className={cn("flex gap-2", className)}>
        <Input
          type="tel"
          placeholder="+34 612 345 678"
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (!v.trim()) {
              onChange("")
              return
            }
            const d = digitsOnly(v)
            onChange(d ? `+${d}` : v)
          }}
          onBlur={() => setTouched(true)}
          aria-invalid={!!showError}
          className={cn(showError && "border-destructive")}
          {...props}
        />
        {showError && (
          <p className="mt-1 text-xs text-destructive">
            {error || validation.error}
          </p>
        )}
      </div>
    )
  }

  const handleCountrySelect = (dial: string) => {
    handleCountryChange(dial)
    setCountryOpen(false)
  }

  const selectedCountry = COUNTRY_CODES.find((c) => c.dial === countryDial)

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-2">
        <Popover open={countryOpen} onOpenChange={setCountryOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={countryOpen}
              className="h-10 w-[130px] shrink-0 justify-between gap-1 px-3 font-normal"
            >
              {countryDial === "_other" ? (
                "Other"
              ) : selectedCountry ? (
                <span className="flex items-center gap-2 truncate">
                  <span className="text-base leading-none">{countryCodeToFlag(selectedCountry.code)}</span>
                  <span>+{selectedCountry.dial}</span>
                </span>
              ) : (
                "Country"
              )}
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search country or code..." />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {COUNTRY_CODES.filter((c) => c.dial).map((c) => (
                    <CommandItem
                      key={c.code}
                      value={`${c.name} ${c.dial} ${c.code}`}
                      onSelect={() => handleCountrySelect(c.dial)}
                    >
                      <span className="mr-2 text-base">{countryCodeToFlag(c.code)}</span>
                      <span>+{c.dial}</span>
                      <span className="ml-2 text-muted-foreground">{c.name}</span>
                    </CommandItem>
                  ))}
                  <CommandItem value="Other" onSelect={() => handleCountrySelect("_other")}>
                    Other
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          type="tel"
          inputMode="numeric"
          placeholder={
            countryDial === "1"
              ? "555 123 4567"
              : countryDial === "34"
                ? "612 345 678"
                : "Local number"
          }
          value={national}
          onChange={handleNationalChange}
          onBlur={() => setTouched(true)}
          aria-invalid={!!showError}
          className={cn("min-w-[100px] flex-1", showError && "border-destructive")}
          {...props}
        />
      </div>
      {showError && (
        <p className="text-xs text-destructive">{error || validation.error}</p>
      )}
    </div>
  )
}
