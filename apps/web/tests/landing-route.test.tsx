import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
  setRequestLocale: vi.fn(),
}));

import Home from "../app/[locale]/page";
import { redirect } from "@/i18n/navigation";

describe("public locale landing routes", () => {
  it.each(["zh", "en"] as const)(
    "renders /%s without redirecting to the workspace",
    async (locale) => {
      await Home({ params: Promise.resolve({ locale }) });

      expect(redirect).not.toHaveBeenCalled();
    },
  );
});
