import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names (shadcn's standard helper). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
