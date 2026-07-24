package sav

import "testing"

func TestDimensionalStorageOwnerUIDFromFilename(t *testing.T) {
	uid, ok := dimensionalStorageOwnerUIDFromFilename(
		"3D7D02DB000000000000000000000000_dps.sav",
	)
	if !ok || uid != "3d7d02db-0000-0000-0000-000000000000" {
		t.Fatalf("unexpected dimensional-storage owner UID: %q, %v", uid, ok)
	}
	for _, name := range []string{
		"3D7D02DB000000000000000000000000.sav",
		"not-a-player_dps.sav",
		"3D7D02DB00000000000000000000000_dps.sav",
	} {
		if uid, ok := dimensionalStorageOwnerUIDFromFilename(name); ok {
			t.Fatalf("accepted non-DPS filename %q as %q", name, uid)
		}
	}
}

func TestDimensionalStorageUsesWrapperInstanceAndAbsoluteArraySlot(t *testing.T) {
	empty := propertyMap{
		"SaveParameter": testStructProperty(propertyMap{
			"CharacterID": {Value: "None"},
		}),
	}
	occupied := propertyMap{
		"InstanceId": testStructProperty(propertyMap{
			"InstanceId": testStructProperty("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		}),
		"SaveParameter": testStructProperty(propertyMap{
			"CharacterID":      {Value: "BOSS_Anubis"},
			"OwnerPlayerUId":   testStructProperty("11111111-2222-3333-4444-555555555555"),
			"Level":            {Value: int32(42)},
			"Gender":           {Value: enumData{Value: "EPalGenderType::Male"}},
			"PassiveSkillList": {Value: []any{"Legend", "Artisan"}},
			"IsBoss":           {Value: true},
		}),
	}
	values := make([]any, 32)
	for index := range values {
		values[index] = empty
	}
	values[31] = occupied
	properties := propertyMap{
		"SaveParameterArray": {Value: values},
	}

	pals, err := dimensionalPalsFromProperties(
		properties,
		"99999999-8888-7777-6666-555555555555",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(pals) != 1 {
		t.Fatalf("unexpected DPS Pal count: %d", len(pals))
	}
	pal := pals[0]
	if pal.InstanceID != "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" {
		t.Fatalf("instance ID = %q", pal.InstanceID)
	}
	if pal.SlotIndex != 31 {
		t.Fatalf("slot index = %d; want 31", pal.SlotIndex)
	}
	if pal.StorageOwnerUID != "99999999-8888-7777-6666-555555555555" {
		t.Fatalf("storage owner UID = %q", pal.StorageOwnerUID)
	}
	if !pal.InDimensionalStorage || pal.LocationAccessScope != "unresolved" {
		t.Fatalf("unexpected DPS placement: %#v", pal)
	}
}

func testStructProperty(value any) *property {
	return &property{Value: structData{Value: value}}
}
