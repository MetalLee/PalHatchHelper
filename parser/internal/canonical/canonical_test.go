package canonical

import (
	"testing"
	"time"

	"github.com/MetalLee/PalHatchHelper/parser/internal/sav"
)

func TestStableIDV1NFKCGoldenVectors(t *testing.T) {
	vectors := map[string]string{
		"Lamball":             "lamball",
		"PlantSlime_Flower":   "plantslime_flower",
		"PAL.Skill-01":        "pal.skill-01",
		"Ｌａｍｂａｌｌ":             "lamball",
		"Pal_01-BOSS.Variant": "pal_01-boss.variant",
		"Kelvin":              "kelvin",
	}
	for source, expected := range vectors {
		actual, err := NormalizeStableID(source)
		if err != nil || actual != expected {
			t.Fatalf("NormalizeStableID(%q) = %q, %v; want %q", source, actual, err, expected)
		}
	}
}

func TestBossInventoryIDMapsToBasePalAndPreservesSourceName(t *testing.T) {
	world := &sav.World{Pals: []sav.Pal{{
		InstanceID:  "pal-boss-1",
		CharacterID: "BOSS_Anubis",
		Gender:      "male",
	}}}

	snapshot, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)

	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Pals) != 1 {
		t.Fatalf("unexpected Pal count: %d", len(snapshot.Pals))
	}
	if snapshot.Pals[0].PalID != "anubis" {
		t.Fatalf("boss Pal ID = %q; want anubis", snapshot.Pals[0].PalID)
	}
	if snapshot.Pals[0].Metadata.SourceInternalName != "BOSS_Anubis" {
		t.Fatalf(
			"source internal name = %q; want BOSS_Anubis",
			snapshot.Pals[0].Metadata.SourceInternalName,
		)
	}
	if !snapshot.Pals[0].IsBoss {
		t.Fatal("boss prefix was normalized without preserving is_boss")
	}
}

func TestBossCompanionInventoryIDMapsToBasePal(t *testing.T) {
	actual, err := NormalizeInventoryPalID("BOSS_KingWhale_otomo")
	if err != nil {
		t.Fatal(err)
	}
	if actual != "kingwhale" {
		t.Fatalf("boss companion Pal ID = %q; want kingwhale", actual)
	}
}

func TestExplicitBossFlagIsPreservedWithoutBossPrefix(t *testing.T) {
	world := &sav.World{Pals: []sav.Pal{{
		InstanceID:  "pal-boss-flag",
		CharacterID: "Anubis",
		IsBoss:      true,
		Gender:      "male",
	}}}

	snapshot, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)

	if err != nil {
		t.Fatal(err)
	}
	if !snapshot.Pals[0].IsBoss {
		t.Fatal("explicit IsBoss flag was lost")
	}
}

func TestCanonicalLocationPreservesBaseAndStorageSlots(t *testing.T) {
	world := &sav.World{
		Players: []sav.Player{{
			UID:                   "player-1",
			Nickname:              "Ada",
			GuildID:               "guild-1",
			PalStorageContainerID: "storage-container",
		}},
		Bases: []sav.BaseCamp{{
			ID:      "base-1",
			GuildID: "guild-1",
			Name:    "Breeding Base",
		}},
		Pals: []sav.Pal{
			{
				InstanceID:  "base-pal",
				CharacterID: "Lamball",
				Gender:      "female",
				BaseID:      "base-1",
				SlotIndex:   7,
			},
			{
				InstanceID:  "storage-pal",
				CharacterID: "Cattiva",
				Gender:      "male",
				OwnerUID:    "player-1",
				ContainerID: "storage-container",
				SlotIndex:   64,
			},
		},
	}

	snapshot, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]Pal{}
	for _, pal := range snapshot.Pals {
		byID[pal.InstanceUID] = pal
	}
	base := byID["base-pal"]
	if base.LocationID == nil || *base.LocationID != "base-1" {
		t.Fatalf("base location ID = %v; want base-1", base.LocationID)
	}
	if base.LocationSlotIndex == nil || *base.LocationSlotIndex != 7 {
		t.Fatalf("base slot = %v; want 7", base.LocationSlotIndex)
	}
	if base.LocationAccessScope != "guild" {
		t.Fatalf("base access scope = %q; want guild", base.LocationAccessScope)
	}
	storage := byID["storage-pal"]
	if storage.LocationSlotIndex == nil || *storage.LocationSlotIndex != 64 {
		t.Fatalf("storage slot = %v; want 64", storage.LocationSlotIndex)
	}
	if storage.LocationAccessScope != "player" {
		t.Fatalf("storage access scope = %q; want player", storage.LocationAccessScope)
	}
}

func TestUnknownFieldsWarnWithoutDroppingPal(t *testing.T) {
	world := &sav.World{Pals: []sav.Pal{{InstanceID: "pal-1", CharacterID: "FuturePal"}}}

	snapshot, warnings, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)

	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Pals) != 1 || snapshot.Pals[0].PalID != "futurepal" {
		t.Fatalf("unknown valid Pal was dropped or guessed: %#v", snapshot.Pals)
	}
	if len(warnings) == 0 {
		t.Fatal("unknown Pal fields produced no safe warnings")
	}
}

func TestStableIDCollisionFailsClosed(t *testing.T) {
	world := &sav.World{Pals: []sav.Pal{
		{InstanceID: "pal-1", CharacterID: "Lamball"},
		{InstanceID: "pal-2", CharacterID: "lamball"},
	}}

	_, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)

	if err == nil || err.Error() != "GAME_ID_NORMALIZATION_COLLISION" {
		t.Fatalf("expected collision failure, got %v", err)
	}
}

func TestDimensionalStorageCharacterIDCaseVariantKeepsStableIDAndSourceEvidence(t *testing.T) {
	world := &sav.World{Pals: []sav.Pal{
		{InstanceID: "storage-pal", CharacterID: "ThunderDog_Ice", Gender: "male"},
		{
			InstanceID: "dimensional-pal", CharacterID: "Thunderdog_Ice", Gender: "female",
			InDimensionalStorage: true, StorageOwnerUID: "player-1", SlotIndex: 50,
		},
	}}

	snapshot, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)

	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Pals) != 2 {
		t.Fatalf("unexpected Pal count: %d", len(snapshot.Pals))
	}
	byID := map[string]Pal{}
	for _, pal := range snapshot.Pals {
		byID[pal.InstanceUID] = pal
	}
	for _, instanceID := range []string{"storage-pal", "dimensional-pal"} {
		if byID[instanceID].PalID != "thunderdog_ice" {
			t.Fatalf("%s Pal ID = %q; want thunderdog_ice", instanceID, byID[instanceID].PalID)
		}
	}
	if byID["storage-pal"].Metadata.SourceInternalName != "ThunderDog_Ice" ||
		byID["dimensional-pal"].Metadata.SourceInternalName != "Thunderdog_Ice" {
		t.Fatalf("source evidence was not preserved: %#v", byID)
	}
}

func TestDimensionalStorageNFKCVariantStillFailsClosed(t *testing.T) {
	world := &sav.World{Pals: []sav.Pal{
		{InstanceID: "storage-pal", CharacterID: "Kelvin"},
		{InstanceID: "dimensional-pal", CharacterID: "Ｋｅｌｖｉｎ", InDimensionalStorage: true},
	}}

	_, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)

	if err == nil || err.Error() != "GAME_ID_NORMALIZATION_COLLISION" {
		t.Fatalf("expected collision failure, got %v", err)
	}
}

func TestDimensionalStorageCharacterIDCaseVariantIsOrderIndependent(t *testing.T) {
	world := &sav.World{Pals: []sav.Pal{
		{InstanceID: "dimensional-pal", CharacterID: "Thunderdog_Ice", InDimensionalStorage: true},
		{InstanceID: "storage-pal", CharacterID: "ThunderDog_Ice"},
	}}

	_, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)

	if err != nil {
		t.Fatal(err)
	}
}

func TestCanonicalItemStacksPreserveResolvedBaseOwnership(t *testing.T) {
	world := &sav.World{
		Bases: []sav.BaseCamp{{
			ID: "base-1", GuildID: "guild-1", Name: "Materials",
		}},
		ItemStacks: []sav.ItemStack{{
			ContainerID: "container-1", ItemID: "Wood", Quantity: 120,
			ContainerType: "storage_box", BaseID: "base-1", SlotIndex: 3,
		}},
	}

	snapshot, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Bases) != 1 || len(snapshot.ItemStacks) != 1 {
		t.Fatalf("unexpected item inventory: %#v", snapshot)
	}
	stack := snapshot.ItemStacks[0]
	if stack.ItemID != "wood" || stack.GuildUID == nil || *stack.GuildUID != "guild-1" {
		t.Fatalf("stack did not preserve normalized item and guild facts: %#v", stack)
	}
	if stack.ResolutionStatus != "resolved" || stack.Quantity != 120 {
		t.Fatalf("resolved stack facts changed: %#v", stack)
	}
}

func TestCanonicalItemStacksPreserveResolvedGuildChestOwnership(t *testing.T) {
	world := &sav.World{
		Guilds: []sav.Guild{{ID: "guild-1", Name: "Builders"}},
		ItemStacks: []sav.ItemStack{{
			ContainerID: "container-1", ItemID: "Wood", Quantity: 25,
			ContainerType: "guild_chest", GuildID: "guild-1", SlotIndex: 1,
		}},
	}

	snapshot, _, err := Build(
		world,
		"fixture-world",
		sav.ContainerFormat{Magic: "PlM", SaveType: 0x31},
		time.Unix(0, 0),
	)
	if err != nil {
		t.Fatal(err)
	}
	stack := snapshot.ItemStacks[0]
	if stack.ContainerType != "guild_chest" || stack.BaseID != nil ||
		stack.GuildUID == nil || *stack.GuildUID != "guild-1" ||
		stack.ResolutionStatus != "resolved" {
		t.Fatalf("guild chest ownership changed: %#v", stack)
	}
}
