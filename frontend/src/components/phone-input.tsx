import * as React from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  COUNTRY_CODES,
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

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-2">
        <Select value={countryDial} onValueChange={handleCountryChange}>
          <SelectTrigger className="w-[130px] shrink-0">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_CODES.filter((c) => c.dial).map((c) => (
              <SelectItem key={c.code} value={c.dial}>
                +{c.dial} {c.name}
              </SelectItem>
            ))}
            <SelectItem value="_other">Other</SelectItem>
          </SelectContent>
        </Select>
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
          className={cn("flex-1", showError && "border-destructive")}
          {...props}
        />
      </div>
      {showError && (
        <p className="text-xs text-destructive">{error || validation.error}</p>
      )}
    </div>
  )
}
