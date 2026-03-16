import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMatchInPast(date: string, time: string): boolean {
  return new Date(`${date}T${time}`) < new Date()
}
