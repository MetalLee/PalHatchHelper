import type { PalInventoryPage } from "@palhatch/contracts";
import { MapPin, UserRound } from "lucide-react";

import { palLocationDisplay } from "@/components/pals/pal-location";
import { StatusChip } from "@/components/status/status-chip";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppLocale, useCopy } from "@/i18n/client";

import { PalIdentity } from "./pal-identity";
import { PalPassiveList } from "./pal-passive-list";
import { isDimensionalSharingUnresolved, palShareLabel } from "./pal-sharing";

type PalInventoryItem = PalInventoryPage["items"][number];

export function PalInventoryCard({
  pal,
  passiveRanks,
  pending,
  onToggleShare,
}: Readonly<{
  pal: PalInventoryItem;
  passiveRanks: Readonly<Record<string, number>>;
  pending: boolean;
  onToggleShare: (palInstanceUid: string, enabled: boolean) => void;
}>) {
  const locale = useAppLocale();
  const t = useCopy("Pals");
  const location = palLocationDisplay(pal, locale);
  const dimensionalSharingUnresolved = isDimensionalSharingUnresolved(pal);
  const switchId = `pal-share-${pal.pal_instance_uid}`;
  const accessibleName =
    pal.catalog_entry_state === "resolved"
      ? pal.pal_display_name
      : t("thisPal");

  return (
    <Card
      role="article"
      data-pal-id={pal.pal_id}
      className="min-w-0 gap-0 overflow-hidden rounded-2xl border-glass-border bg-card/92 py-0 shadow-soft transition-[transform,box-shadow] motion-reduce:transition-none md:hover:-translate-y-0.5 md:hover:shadow-float"
    >
      <CardHeader className="px-3 pt-3 sm:px-4 sm:pt-4">
        <PalIdentity pal={pal} />
      </CardHeader>

      <CardContent className="grid gap-3 px-3 py-3 sm:px-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <dt className="sr-only">{t("owner")}</dt>
            <UserRound
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <dd className="truncate font-medium text-foreground">
              {pal.owner_display_name}
            </dd>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <dt className="sr-only">{t("location")}</dt>
            <MapPin
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            />
            <dd className="min-w-0 text-sm font-medium text-foreground">
              {location.label}
              {location.detail === null ? null : (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="font-normal text-muted-foreground">
                    {location.detail}
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
            {t("passives")}
          </p>
          <PalPassiveList pal={pal} passiveRanks={passiveRanks} />
        </div>
      </CardContent>

      <CardFooter className="mt-auto min-h-14 justify-between gap-3 border-t border-border/70 bg-accent/28 px-3 py-2.5 sm:px-4">
        <StatusChip
          tone={
            dimensionalSharingUnresolved || !pal.share_enabled
              ? "warning"
              : "good"
          }
        >
          {palShareLabel(pal, dimensionalSharingUnresolved, locale)}
        </StatusChip>

        {pal.is_owned_by_requester && !dimensionalSharingUnresolved ? (
          <div className="flex shrink-0 items-center gap-2">
            <Label htmlFor={switchId} className="text-xs font-semibold">
              {t("share")}
            </Label>
            <Switch
              id={switchId}
              checked={pal.share_enabled}
              disabled={pending}
              aria-label={t("guildShareLabel", { name: accessibleName })}
              aria-busy={pending}
              onCheckedChange={(enabled) =>
                onToggleShare(pal.pal_instance_uid, enabled)
              }
            />
          </div>
        ) : dimensionalSharingUnresolved ? (
          <p className="max-w-36 text-right text-[0.68rem] leading-4 text-muted-foreground">
            {t("dimensionalUnresolved")}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}
