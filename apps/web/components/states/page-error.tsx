import { AlertCircle } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function PageError({
  code,
  title,
  description,
  action,
  className,
  headingLevel = "h2",
}: Readonly<{
  code?: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  headingLevel?: "h1" | "h2" | "h3";
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const Heading = headingLevel;

  return (
    <Alert
      variant="destructive"
      role="alert"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "rounded-2xl border-rose-200 bg-rose-50/90 p-5 text-rose-900 shadow-soft",
        className,
      )}
    >
      <AlertCircle aria-hidden="true" className="size-5" />
      {code ? (
        <p className="mb-1 font-mono text-xs font-semibold text-rose-700">
          {code}
        </p>
      ) : null}
      <Heading
        id={titleId}
        className="col-start-2 min-h-4 text-lg font-bold tracking-tight"
      >
        {title}
      </Heading>
      <AlertDescription id={descriptionId} className="text-rose-800">
        {description}
      </AlertDescription>
      {action ? <div className="col-start-2 mt-4">{action}</div> : null}
    </Alert>
  );
}
