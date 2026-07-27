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
      <legend className="text-sm font-semibold text-foreground">
        其他设置
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
                允许使用公会共享
              </Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                开启后，会把公会伙伴愿意共享的帕鲁一起加入推荐。
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

        <div className="grid min-h-24 min-w-0 grid-cols-[auto_minmax(0,1fr)_5.5rem] items-center gap-3 rounded-2xl border border-border bg-white/55 p-4 transition-colors hover:border-primary/25 hover:bg-accent/50">
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
              路线最多经过 1 至 8 代
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
            className="rounded-xl text-center font-semibold"
          />
        </div>
      </div>
    </fieldset>
  );
}
