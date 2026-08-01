"use client";

import { useSyncExternalStore } from "react";

export type VisitorDateTimeOptions = Pick<
  Intl.DateTimeFormatOptions,
  "dateStyle" | "timeStyle"
>;

type FormatOptions = {
  timeZone?: string;
};

function subscribeToVisitorTimeZone(): () => void {
  return () => undefined;
}

function resolveVisitorTimeZone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatVisitorDateTime(
  value: string,
  locale: string,
  options: VisitorDateTimeOptions,
  { timeZone = resolveVisitorTimeZone() }: FormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(value));
}

export function VisitorDateTime({
  value,
  locale,
  options,
  timeZone,
}: Readonly<{
  value: string;
  locale: string;
  options: VisitorDateTimeOptions;
  timeZone?: string;
}>) {
  const formatted = useSyncExternalStore(
    subscribeToVisitorTimeZone,
    () => formatVisitorDateTime(value, locale, options, { timeZone }),
    () => null,
  );

  return (
    <time dateTime={value} suppressHydrationWarning>
      {formatted ?? "…"}
    </time>
  );
}
