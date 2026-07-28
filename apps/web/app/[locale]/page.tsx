import { redirect } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/routing";
import { notFound } from "next/navigation";

export default async function Home({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  redirect({ href: "/overview", locale });
}
