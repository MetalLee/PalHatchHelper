import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BindingInvitationConfirmation } from "@/features/sync/binding-invitation-confirmation";
import { AppLocaleProvider } from "@/i18n/client";

describe("binding invitation confirmation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("previews the invited member and never rebinds before explicit confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          player_id: "30000000-0000-4000-8000-000000000099",
          nickname: "Invited Player",
          level: 42,
          guild_name: "Fixture Guild",
          world_name: "Fixture World",
          device_name: "Fixture Server",
          discriminator: "#abc123",
          expires_at: "2026-08-04T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        response({
          player_id: "30000000-0000-4000-8000-000000000099",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AppLocaleProvider locale="zh">
        <BindingInvitationConfirmation token={"a".repeat(43)} />
      </AppLocaleProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Invited Player #abc123",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/不会改变既有配种任务和收藏/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sync/binding-invitations/${"a".repeat(43)}`,
      expect.objectContaining({ cache: "no-store" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "确认绑定" }));
    expect(await screen.findByText("角色绑定成功")).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/sync/binding-invitations/${"a".repeat(43)}`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
