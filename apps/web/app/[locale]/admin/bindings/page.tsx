import { getTranslations } from "next-intl/server";

import {
  AdminActionButton,
  BindingCreateForm,
  BindingUpdateForm,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminCode,
  AdminEmpty,
  AdminPageHeader,
  adminActionStackClasses,
  adminActionsClasses,
  adminControlClasses,
  adminPageClasses,
  adminPanelClasses,
  adminTableFrameClasses,
  formatAdminTime,
} from "@/features/admin/presentation";
import {
  loadAdminBindings,
  requireAdminPageAccess,
} from "@/features/admin/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireAppLocale } from "@/i18n/server-locale";

export default async function AdminBindingsPage({
  searchParams,
  params,
}: Readonly<{
  searchParams: Promise<{ q?: string }>;
  params: Promise<{ locale: string }>;
}>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Admin" });
  const formatTime = (value: string | null) =>
    formatAdminTime(value, locale, t("notReported"));
  const { q = "" } = await searchParams;
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const data = await loadAdminBindings(q.slice(0, 120));
  return (
    <div className={adminPageClasses}>
      <AdminPageHeader
        eyebrow={t("bindingsEyebrow")}
        title={t("bindingsTitle")}
        description={t("bindingsDescription")}
      />
      <section className={adminPanelClasses}>
        <form className={adminActionsClasses} method="get">
          <input
            className={`${adminControlClasses} flex-1`}
            aria-label={t("searchBinding")}
            name="q"
            defaultValue={q}
            placeholder={t("searchBindingPlaceholder")}
          />
          <Button variant="outline" type="submit">
            {t("search")}
          </Button>
        </form>
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("createBinding")}</h2>
        <BindingCreateForm users={data.users} players={data.players} />
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("accountSummary")}</h2>
        {data.users.length === 0 ? (
          <AdminEmpty>{t("noAccounts")}</AdminEmpty>
        ) : (
          <div className={adminTableFrameClasses}>
            <Table className="min-w-[52rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("user")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("gamePlayer")}</TableHead>
                  <TableHead>{t("worldGuild")}</TableHead>
                  <TableHead>{t("version")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell>{user.user_display}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>
                      {user.player_nickname ?? t("notLinked")}
                    </TableCell>
                    <TableCell>
                      {user.world_name ?? "—"} / {user.guild_name ?? "—"}
                    </TableCell>
                    <TableCell>{user.binding_version ?? "—"}</TableCell>
                    <TableCell>
                      {user.binding_version === null ? (
                        "—"
                      ) : (
                        <div className={adminActionStackClasses}>
                          <BindingUpdateForm
                            user={user}
                            players={data.players}
                          />
                          <AdminActionButton
                            action="binding_delete"
                            payload={{
                              user_id: user.user_id,
                              expected_version: user.binding_version,
                            }}
                            confirmText={t("unbind")}
                          >
                            {t("unbind")}
                          </AdminActionButton>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("bindingHistory")}</h2>
        {data.events.length === 0 ? (
          <AdminEmpty>{t("noBindingHistory")}</AdminEmpty>
        ) : (
          <div className={adminTableFrameClasses}>
            <Table className="min-w-[48rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("time")}</TableHead>
                  <TableHead>{t("event")}</TableHead>
                  <TableHead>{t("user")}</TableHead>
                  <TableHead>{t("player")}</TableHead>
                  <TableHead>{t("actor")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map((event) => (
                  <TableRow key={event.event_id}>
                    <TableCell>{formatTime(event.created_at)}</TableCell>
                    <TableCell>{event.event_type}</TableCell>
                    <TableCell>
                      <AdminCode>{event.user_id}</AdminCode>
                    </TableCell>
                    <TableCell>
                      <AdminCode>{event.player_id ?? "—"}</AdminCode>
                    </TableCell>
                    <TableCell>{event.actor_display}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
