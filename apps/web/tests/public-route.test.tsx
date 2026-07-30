import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
  setRequestLocale: vi.fn(),
}));

import GuildPalInventoryPage from "../app/[locale]/guild-pal-inventory/page";
import PalworldSaveSyncPage from "../app/[locale]/palworld-save-sync/page";
import PassiveBreedingRoutePage from "../app/[locale]/passive-breeding-route/page";
import SaveBreedingPlannerPage from "../app/[locale]/save-breeding-planner/page";
import type { PublicPageSlug } from "@/features/public-content/page-config";

const routes = [
  [PalworldSaveSyncPage, "palworld-save-sync"],
  [SaveBreedingPlannerPage, "save-breeding-planner"],
  [PassiveBreedingRoutePage, "passive-breeding-route"],
  [GuildPalInventoryPage, "guild-pal-inventory"],
] as const;

describe("public route server components", () => {
  it.each(["zh", "en"] as const)(
    "renders all %s public routes without an auth redirect",
    async (locale) => {
      for (const [Page, slug] of routes) {
        const element = await Page({ params: Promise.resolve({ locale }) });
        expect(element.props).toMatchObject({
          locale,
          slug: slug satisfies PublicPageSlug,
        });
      }
    },
  );
});
