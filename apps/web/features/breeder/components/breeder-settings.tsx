"use client";

import { GitBranch, UsersRound } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCopy } from "@/i18n/client";

export function BreederSettings({
  allowShared,
  onAllowSharedChange,
  maxGenerations,
  onMaxGenerationsChange,
}: Readonly<{
  allowShared: boolean;
  onAllowSharedChange: (value: boolean) => void;
  maxGenerations: number;
  onMaxGenerationsChange: (value: number) => void;
}>) {
  const t = useCopy("Breeder");
  return (
    <fieldset className="grid min-w-0 gap-4">
      <legend className="text-sm font-semibold text-foreground">
        {t("otherSettings")}
      </legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="flex min-h-24 min-w-0 items-center justify-between gap-3 rounded-2xl border border-border bg-white/55 p-4 transition-colors hover:border-primary/25 hover:bg-accent/50">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
              <UsersRound aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <Label
                htmlFor="allow-guild-shared"
                className="font-bold text-foreground"
              >
                {t("allowGuild")}
              </Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("allowGuildDescription")}
              </p>
            </div>
          </div>
          <Switch
            id="allow-guild-shared"
            checked={allowShared}
            onCheckedChange={onAllowSharedChange}
            aria-label={t("allowGuild")}
            className="after:-inset-4"
          />
        </div>

        <div className="grid min-h-24 min-w-0 grid-cols-[auto_minmax(0,1fr)_5.5rem] items-center gap-3 rounded-2xl border border-border bg-white/55 p-4 transition-colors hover:border-primary/25 hover:bg-accent/50">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800">
            <GitBranch aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <Label
              htmlFor="max-generations"
              className="font-bold text-foreground"
            >
              {t("maxGenerationLabel")}
            </Label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("maxGenerationDescription")}
            </p>
          </div>
          <Input
            id="max-generations"
            type="number"
            inputMode="numeric"
            min={1}
            max={5}
            value={maxGenerations}
            onChange={(event) =>
              onMaxGenerationsChange(Number(event.target.value))
            }
            aria-label={t("maxGenerationLabel")}
            className="rounded-xl text-center font-semibold"
          />
        </div>
      </div>
    </fieldset>
  );
}
