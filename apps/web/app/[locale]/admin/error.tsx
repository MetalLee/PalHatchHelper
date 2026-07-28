"use client";

import { PageError } from "@/components/states/page-error";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/i18n/client";

export default function AdminError({ reset }: Readonly<{ reset: () => void }>) {
  const t = useCopy("Admin");
  return (
    <PageError
      code="ADMIN_DATA_UNAVAILABLE"
      title={t("errorTitle")}
      description={t("errorDescription")}
      headingLevel="h1"
      className="mx-auto max-w-2xl"
      action={
        <Button variant="outline" onClick={reset} type="button">
          {t("retry")}
        </Button>
      }
    />
  );
}
