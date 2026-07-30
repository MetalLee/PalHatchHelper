import type { LucideIcon } from "lucide-react";
import { GitBranch, RefreshCw, Route, UsersRound } from "lucide-react";

export const publicPageSlugs = [
  "palworld-save-sync",
  "save-breeding-planner",
  "passive-breeding-route",
  "guild-pal-inventory",
] as const;

export type PublicPageSlug = (typeof publicPageSlugs)[number];
export type PublicMessageKey =
  | "saveSync"
  | "savePlanner"
  | "passiveRoute"
  | "guildInventory";

type PublicSectionConfig = Readonly<{
  key: string;
  points: readonly string[];
  commands?: readonly string[];
}>;

export type PublicPageProfile = Readonly<{
  slug: PublicPageSlug;
  messageKey: PublicMessageKey;
  Icon: LucideIcon;
  sections: readonly PublicSectionConfig[];
  faqKeys: readonly string[];
  related: readonly (PublicPageSlug | "home")[];
  ctaHref: "/login" | "/breeder";
}>;

export const publicPageProfiles = {
  "palworld-save-sync": {
    slug: "palworld-save-sync",
    messageKey: "saveSync",
    Icon: RefreshCw,
    sections: [
      { key: "purpose", points: ["one", "two", "three"] },
      {
        key: "install",
        points: ["one", "two"],
        commands: ["npm install -g palbeacon-cli", "palbeacon init"],
      },
      { key: "world", points: ["one", "two", "three"] },
      {
        key: "run",
        points: ["one", "two", "three"],
        commands: ["palbeacon run"],
      },
      { key: "safety", points: ["one", "two", "three", "four"] },
    ],
    faqKeys: ["one", "two", "three", "four", "five"],
    related: ["home", "guild-pal-inventory", "save-breeding-planner"],
    ctaHref: "/login",
  },
  "save-breeding-planner": {
    slug: "save-breeding-planner",
    messageKey: "savePlanner",
    Icon: GitBranch,
    sections: [
      { key: "difference", points: ["one", "two", "three"] },
      { key: "inventory", points: ["one", "two", "three"] },
      { key: "intermediate", points: ["one", "two", "three"] },
      { key: "routes", points: ["one", "two", "three"] },
      { key: "limits", points: ["one", "two", "three"] },
    ],
    faqKeys: ["one", "two", "three", "four"],
    related: ["home", "passive-breeding-route", "guild-pal-inventory"],
    ctaHref: "/breeder",
  },
  "passive-breeding-route": {
    slug: "passive-breeding-route",
    messageKey: "passiveRoute",
    Icon: Route,
    sections: [
      { key: "distribution", points: ["one", "two", "three"] },
      { key: "intermediate", points: ["one", "two", "three"] },
      { key: "constraints", points: ["one", "two", "three"] },
      { key: "reading", points: ["one", "two", "three"] },
      { key: "randomness", points: ["one", "two", "three"] },
    ],
    faqKeys: ["one", "two", "three", "four"],
    related: ["home", "save-breeding-planner"],
    ctaHref: "/breeder",
  },
  "guild-pal-inventory": {
    slug: "guild-pal-inventory",
    messageKey: "guildInventory",
    Icon: UsersRound,
    sections: [
      { key: "players", points: ["one", "two", "three"] },
      { key: "sharing", points: ["one", "two", "three"] },
      { key: "privacy", points: ["one", "two", "three"] },
      { key: "breeding", points: ["one", "two", "three"] },
      { key: "collaboration", points: ["one", "two", "three"] },
    ],
    faqKeys: ["one", "two", "three", "four"],
    related: ["home", "palworld-save-sync", "save-breeding-planner"],
    ctaHref: "/login",
  },
} as const satisfies Record<PublicPageSlug, PublicPageProfile>;

export function isPublicPageSlug(value: string): value is PublicPageSlug {
  return publicPageSlugs.includes(value as PublicPageSlug);
}
