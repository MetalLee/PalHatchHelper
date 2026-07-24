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
