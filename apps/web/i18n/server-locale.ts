import { notFound } from "next/navigation";

import { isAppLocale, type AppLocale } from "./routing";

export function requireAppLocale(value: string): AppLocale {
  if (!isAppLocale(value)) notFound();
  return value;
}
