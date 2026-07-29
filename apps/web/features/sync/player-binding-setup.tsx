"use client";

import { CircleHelp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useCopy } from "@/i18n/client";

import { SyncDeviceCard } from "./sync-device-card";

export function PlayerBindingSetup({
  hasBinding = false,
}: Readonly<{ hasBinding?: boolean }>) {
  const t = useCopy("Sync");
  const questions = [
    {
      question: "faqMatchingQuestion",
      answer: "faqMatchingAnswer",
    },
    {
      question: "faqSaveDirectoryQuestion",
      answer: "faqSaveDirectoryAnswer",
    },
    {
      question: "faqSafetyQuestion",
      answer: "faqSafetyAnswer",
    },
  ] as const;

  return (
    <div className="grid min-w-0 gap-6">
      <SyncDeviceCard hasBinding={hasBinding} />
      <Card className="border-glass-border bg-card/90 py-0 shadow-soft">
        <CardContent className="grid gap-5 p-5 sm:p-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <CircleHelp aria-hidden="true" className="size-5 text-primary" />
              {t("faqTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("faqDescription")}
            </p>
          </div>
          <dl className="grid gap-3 lg:grid-cols-3">
            {questions.map((question) => (
              <div
                key={question.question}
                className="rounded-2xl border border-border/70 bg-muted/35 p-4"
              >
                <dt className="font-bold text-foreground">
                  {t(question.question)}
                </dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(question.answer)}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
