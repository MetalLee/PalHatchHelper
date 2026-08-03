import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BindingInvitationConfirmation } from "@/features/sync/binding-invitation-confirmation";
import { AppLocaleProvider } from "@/i18n/client";

const token = "a".repeat(43);

const preview = {
  device_name: "Fixture Server",
  world_name: "Fixture World",
  expires_at: "2026-08-04T00:00:00.000Z",
  players: [
    {
      player_id: "30000000-0000-4000-8000-000000000099",
      nickname: "Invited Player",
      level: 42,
      guild_name: "Fixture Guild",
      discriminator: "#abc123",
    },
    {
      player_id: "30000000-0000-4000-8000-000000000098",
      nickname: "Second Player",
      level: 33,
      guild_name: null,
      discriminator: "#def456",
    },
  ],
};

describe("binding invitation confirmation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists unbound members and binds only after choosing and confirming", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(preview))
      .mockResolvedValueOnce(
        response({ player_id: "30000000-0000-4000-8000-000000000099" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AppLocaleProvider locale="zh">
        <BindingInvitationConfirmation token={token} />
      </AppLocaleProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Fixture Server" }),
    ).toBeTruthy();
    expect(screen.getByText("Fixture World")).toBeTruthy();
    expect(screen.getByText("Invited Player")).toBeTruthy();
    expect(screen.getByText("Second Player")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sync/binding-invitations/${token}`,
      expect.objectContaining({ cache: "no-store" }),
    );

    const accept = screen.getByRole("button", { name: "确认绑定" });
    expect((accept as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Invited Player/ }));
    expect((accept as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(accept);
    expect(await screen.findByText("角色绑定成功")).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/sync/binding-invitations/${token}`,
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          player_id: "30000000-0000-4000-8000-000000000099",
        }),
      }),
    );
  });

  it("shows an empty state when every member is already linked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response({ ...preview, players: [] })),
    );

    render(
      <AppLocaleProvider locale="zh">
        <BindingInvitationConfirmation token={token} />
      </AppLocaleProvider>,
    );

    expect(await screen.findByText(/该服务器所有角色都已被绑定/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "确认绑定" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
