import { describe, expect, it } from "vitest";

import {
  catalogLocaleFor,
  isAppLocale,
  stripLocalePrefix,
} from "@/i18n/routing";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh.json";

function messageKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof child === "object" && child !== null
      ? messageKeys(child as object, path)
      : [path];
  });
}

describe("i18n routing", () => {
  it("maps public route locales to versioned game catalog locales", () => {
    expect(catalogLocaleFor("zh")).toBe("zh-CN");
    expect(catalogLocaleFor("en")).toBe("en-US");
  });

  it("accepts only the supported public locales", () => {
    expect(isAppLocale("zh")).toBe(true);
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("zh-CN")).toBe(false);
    expect(isAppLocale("fr")).toBe(false);
  });

  it("normalizes localized paths without changing dynamic segments", () => {
    expect(stripLocalePrefix("/zh/pals")).toBe("/pals");
    expect(stripLocalePrefix("/en/breeder/jobs/job.id")).toBe(
      "/breeder/jobs/job.id",
    );
    expect(stripLocalePrefix("/api/health")).toBe("/api/health");
  });

  it("keeps the Chinese and English message catalogs structurally identical", () => {
    expect(messageKeys(enMessages).sort()).toEqual(
      messageKeys(zhMessages).sort(),
    );
  });
});
