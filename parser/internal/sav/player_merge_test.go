package sav

import "testing"

func TestMergePlayerMatchesCompactAndHyphenatedUIDs(t *testing.T) {
	world := World{Players: []Player{{
		UID:      "3d7d02db-0000-0000-0000-000000000000",
		Nickname: "Fixture Player",
		GuildID:  "fixture-guild",
	}}}

	mergePlayer(&world, Player{
		UID:                   "3D7D02DB000000000000000000000000",
		OtomoContainerID:      "fixture-party-container",
		PalStorageContainerID: "fixture-storage-container",
	})

	if len(world.Players) != 1 {
		t.Fatalf("expected one merged player, got %d", len(world.Players))
	}
	player := world.Players[0]
	if player.OtomoContainerID != "fixture-party-container" {
		t.Fatalf("party container was not merged: %#v", player)
	}
	if player.PalStorageContainerID != "fixture-storage-container" {
		t.Fatalf("storage container was not merged: %#v", player)
	}
}

func TestPlayerUIDFromSaveFilenameAcceptsOnlyCanonicalPlayerSaves(t *testing.T) {
	uid, ok := playerUIDFromSaveFilename("3D7D02DB000000000000000000000000.sav")
	if !ok || uid != "3d7d02db-0000-0000-0000-000000000000" {
		t.Fatalf("unexpected canonical player UID: %q, %v", uid, ok)
	}

	for _, name := range []string{
		"3D7D02DB000000000000000000000000_dps.sav",
		"not-a-player.sav",
		"3D7D02DB00000000000000000000000.sav",
	} {
		if uid, ok := playerUIDFromSaveFilename(name); ok {
			t.Fatalf("accepted sidecar or invalid player save %q as %q", name, uid)
		}
	}
}
