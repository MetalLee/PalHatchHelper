"use client";

import { GitBranch, UsersRound } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
  return (
    <fieldset className="grid min-w-0 gap-4">
      <legend className="font-semibold text-foreground">其他配置</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="flex min-h-24 min-w-0 items-center justify-between gap-3 rounded-2xl border border-border bg-white/62 p-4">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
              <UsersRound aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <Label
                htmlFor="allow-guild-shared"
                className="font-bold text-foreground"
              >
                允许使用公会共享
              </Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                仅使用上下文中已确认可共享的实例。
              </p>
            </div>
          </div>
          <Switch
            id="allow-guild-shared"
            checked={allowShared}
            onCheckedChange={onAllowSharedChange}
            aria-label="允许使用公会共享"
            className="after:-inset-4"
          />
        </div>

        <div className="grid min-h-24 min-w-0 grid-cols-[auto_minmax(0,1fr)_5.5rem] items-center gap-3 rounded-2xl border border-border bg-white/62 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800">
            <GitBranch aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <Label
              htmlFor="max-generations"
              className="font-bold text-foreground"
            >
              最大代数
            </Label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              可选 1 至 8 代
            </p>
          </div>
          <Input
            id="max-generations"
            type="number"
            inputMode="numeric"
            min={1}
            max={8}
            value={maxGenerations}
            onChange={(event) =>
              onMaxGenerationsChange(Number(event.target.value))
            }
            aria-label="最大代数"
            className="text-center font-semibold"
          />
        </div>
      </div>
    </fieldset>
  );
}
