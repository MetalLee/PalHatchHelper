"use client";

import { createContext, type ReactNode, useContext } from "react";

import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh.json";

import type { AppLocale } from "./routing";

type MessageCatalog = typeof zhMessages;
type MessageNamespace = keyof MessageCatalog;
type NamespaceMessages<N extends MessageNamespace> = MessageCatalog[N];

const LocaleContext = createContext<AppLocale>("zh");

export function AppLocaleProvider({
  locale,
  children,
}: Readonly<{ locale: AppLocale; children: ReactNode }>) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useAppLocale(): AppLocale {
  return useContext(LocaleContext);
}

function interpolate(
  message: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}

export function getCopy<N extends MessageNamespace>(
  locale: AppLocale,
  namespace: N,
): <K extends keyof NamespaceMessages<N>>(
  key: K,
  values?: Readonly<Record<string, string | number>>,
) => string {
  const catalog = (locale === "en" ? enMessages : zhMessages) as MessageCatalog;
  return (key, values = {}) => {
    const value = catalog[namespace][key];
    if (typeof value !== "string")
      throw new Error(`INVALID_MESSAGE:${String(key)}`);
    return interpolate(value, values);
  };
}

export function useCopy<N extends MessageNamespace>(namespace: N) {
  return getCopy(useAppLocale(), namespace);
}
