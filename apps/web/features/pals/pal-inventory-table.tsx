import type { PalInventoryPage } from "@palhatch/contracts";

import { palLocationDisplay } from "@/components/pals/pal-location";
import { StatusChip } from "@/components/status/status-chip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppLocale, useCopy } from "@/i18n/client";

import { PalIdentity } from "./pal-identity";
import { PalPassiveList } from "./pal-passive-list";
import { isDimensionalSharingUnresolved, palShareLabel } from "./pal-sharing";

type PalInventoryItem = PalInventoryPage["items"][number];

export function PalInventoryTable({
  items,
  passiveRanks,
  pendingId,
  onToggleShare,
}: Readonly<{
  items: readonly PalInventoryItem[];
  passiveRanks: Readonly<Record<string, number>>;
  pendingId: string | null;
  onToggleShare: (palInstanceUid: string, enabled: boolean) => void;
}>) {
  const t = useCopy("Pals");
  return (
    <div className="overflow-hidden rounded-2xl border border-glass-border bg-card/92 shadow-soft">
      <Table aria-label={t("tableLabel")} className="min-w-[58rem] table-fixed">
        <TableHeader className="bg-accent/45">
          <TableRow>
            <TableHead className="w-[17rem] px-4">{t("pal")}</TableHead>
            <TableHead className="w-[10rem]">{t("owner")}</TableHead>
            <TableHead className="w-[16rem]">{t("passives")}</TableHead>
            <TableHead className="w-[10rem]">{t("location")}</TableHead>
            <TableHead className="w-[9rem] pr-4 text-right">
              {t("share")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((pal) => (
            <PalInventoryTableRow
              key={pal.pal_instance_uid}
              pal={pal}
              passiveRanks={passiveRanks}
              pending={pendingId === pal.pal_instance_uid}
              onToggleShare={onToggleShare}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PalInventoryTableRow({
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
  const switchId = `pal-table-share-${pal.pal_instance_uid}`;
  const accessibleName =
    pal.catalog_entry_state === "resolved"
      ? pal.pal_display_name
      : t("thisPal");

  return (
    <TableRow data-pal-id={pal.pal_id}>
      <TableCell className="px-4 py-3 whitespace-normal">
        <PalIdentity pal={pal} portraitSize={44} compact />
      </TableCell>
      <TableCell className="truncate font-medium">
        {pal.owner_display_name}
      </TableCell>
      <TableCell className="whitespace-normal">
        <PalPassiveList
          pal={pal}
          passiveRanks={passiveRanks}
          className="max-h-16 overflow-hidden"
        />
      </TableCell>
      <TableCell className="whitespace-normal">
        <span className="font-medium">{location.label}</span>
        {location.detail === null ? null : (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {location.detail}
          </span>
        )}
      </TableCell>
      <TableCell className="pr-4">
        <div className="flex justify-end">
          {pal.is_owned_by_requester && !dimensionalSharingUnresolved ? (
            <div className="flex items-center gap-2">
              <StatusChip tone={pal.share_enabled ? "good" : "warning"}>
                {palShareLabel(pal, false, locale)}
              </StatusChip>
              <Label htmlFor={switchId} className="sr-only">
                {t("guildShareLabel", { name: accessibleName })}
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
          ) : (
            <StatusChip
              tone={
                dimensionalSharingUnresolved || !pal.share_enabled
                  ? "warning"
                  : "good"
              }
            >
              {palShareLabel(pal, dimensionalSharingUnresolved, locale)}
            </StatusChip>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
