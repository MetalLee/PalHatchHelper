package sav

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestItemContainerSlotsPreservePhysicalContainerAndCounts(t *testing.T) {
	const containerID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	entry := mapEntry{
		Key: propertyMap{"ID": testStructProperty(containerID)},
		Value: structData{Value: propertyMap{
			"Slots": {Value: []any{
				propertyMap{
					"ItemId": testStructProperty(propertyMap{"StaticId": {Value: "Wood"}}),
					"StackCount": {Value: int32(120)},
				},
				propertyMap{
					"ItemId": testStructProperty(propertyMap{"StaticId": {Value: "None"}}),
					"StackCount": {Value: int32(0)},
				},
			}},
		}},
	}
	stats := newStats()
	items, complete := itemStacksFromEntry(entry, &stats)
	if !complete {
		t.Fatal("valid item container was marked partial")
	}
	if len(items) != 1 {
		t.Fatalf("unexpected item count: %#v", items)
	}
	if items[0].ContainerID != containerID || items[0].ItemID != "Wood" ||
		items[0].Quantity != 120 || items[0].SlotIndex != 0 {
		t.Fatalf("item stack facts changed: %#v", items[0])
	}
	if items[0].ContainerType != "unknown" || items[0].BaseID != "" {
		t.Fatalf("unconfirmed ownership was guessed: %#v", items[0])
	}
}

func TestItemContainerStructuralDriftIsPartial(t *testing.T) {
	entry := mapEntry{
		Key: propertyMap{"ID": testStructProperty("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")},
		Value: structData{Value: propertyMap{
			"Slots": {Value: []any{"not-a-slot"}},
		}},
	}
	stats := newStats()
	items, complete := itemStacksFromEntry(entry, &stats)
	if complete || len(items) != 0 {
		t.Fatalf("structural drift was accepted: complete=%v items=%#v", complete, items)
	}
	if len(stats.SkippedDetails) != 1 ||
		stats.SkippedDetails[0] != "worldSaveData.ItemContainerSaveData.Value.Slots (invalid-slot)" {
		t.Fatalf("structural drift was not diagnosed: %#v", stats.SkippedDetails)
	}
}

func TestDecodeBaseRawIncludesConfirmedAreaAndGuild(t *testing.T) {
	const baseID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	const guildID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	var raw bytes.Buffer
	writeRepeatedTestGUID(t, &raw, 0xaa)
	writeTestANSIString(t, &raw, "Ore Base")
	raw.WriteByte(0)
	for _, value := range []float64{0, 0, 0, 1, 1200, -3400, 50, 1, 1, 1} {
		if err := binary.Write(&raw, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	if err := binary.Write(&raw, binary.LittleEndian, float32(5000)); err != nil {
		t.Fatal(err)
	}
	writeRepeatedTestGUID(t, &raw, 0xbb)

	name, location, areaRange, decodedGuildID, ok := decodeBaseRaw(raw.Bytes(), baseID)
	if !ok || name != "Ore Base" || location == nil {
		t.Fatalf("base raw prefix was not decoded: %q %#v %v", name, location, ok)
	}
	if location.X != 1200 || location.Y != -3400 || location.Z != 50 || areaRange != 5000 {
		t.Fatalf("base spatial facts changed: %#v range=%v", location, areaRange)
	}
	if decodedGuildID != guildID {
		t.Fatalf("base guild = %q; want %q", decodedGuildID, guildID)
	}
}

func TestDecodeItemContainerModuleRaw(t *testing.T) {
	const containerID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
	var raw bytes.Buffer
	writeRepeatedTestGUID(t, &raw, 0xcc)
	writeTestUint32(t, &raw, 2)
	raw.WriteByte(itemSlotAttributePublicOutput)
	writeTestUint32(t, &raw, 1)
	writeTestInt32(t, &raw, 3)
	raw.WriteByte(itemSlotAttributeFoodProvidable)
	writeTestUint32(t, &raw, 1)
	writeTestInt32(t, &raw, 7)
	writeTestUint32(t, &raw, 8)
	raw.Write([]byte{0, 0, 0, itemSlotAttributePublicOutput, 0, 0, 0, itemSlotAttributeFoodProvidable})
	writeTestUint32(t, &raw, 0)
	raw.WriteByte(itemContainerUsageStorage)

	decoded, ok := decodeItemContainerModuleRaw(raw.Bytes())
	if !ok || decoded.ContainerID != containerID || decoded.UsageType != itemContainerUsageStorage {
		t.Fatalf("container module was not decoded: %#v, %v", decoded, ok)
	}
	if decoded.SlotAttributes[3] != itemSlotAttributePublicOutput ||
		decoded.SlotAttributes[7] != itemSlotAttributeFoodProvidable {
		t.Fatalf("slot attributes changed: %#v", decoded.SlotAttributes)
	}
}

func TestItemContainerOwnershipsFromMapObjectModule(t *testing.T) {
	var raw bytes.Buffer
	writeRepeatedTestGUID(t, &raw, 0xcc)
	writeTestUint32(t, &raw, 1)
	raw.WriteByte(itemSlotAttributeUndefined)
	writeTestUint32(t, &raw, 1)
	writeTestInt32(t, &raw, 0)
	writeTestUint32(t, &raw, 1)
	raw.WriteByte(itemSlotAttributeUndefined)
	writeTestUint32(t, &raw, 0)
	raw.WriteByte(itemContainerUsageStorage)

	root := propertyMap{
		"MapObjectSaveData": {Value: []any{
			propertyMap{
				"WorldLocation": {Value: structData{Value: Vector{X: 10, Y: 20, Z: 30}}},
				"ConcreteModel": testStructProperty(propertyMap{
					"ModuleMap": {Value: []mapEntry{{
						Key: "EPalMapObjectConcreteModelModuleType::ItemContainer",
						Value: structData{Value: propertyMap{"RawData": {Value: raw.Bytes()}}},
					}}},
				}),
			},
		}},
	}
	stats := newStats()
	owners := itemContainerOwnershipsFromRoot(root, &stats)
	owner, ok := owners["cccccccc-cccc-cccc-cccc-cccccccccccc"]
	if !ok || owner.Position != (Vector{X: 10, Y: 20, Z: 30}) {
		t.Fatalf("map object ownership was not decoded: %#v", owners)
	}
	if stats.DecodeFailures["item_container_ownership"] != 0 {
		t.Fatalf("valid ownership recorded a failure: %#v", stats.DecodeFailures)
	}
}

func TestAssignItemStackOwnershipRequiresUniqueSameGuildBase(t *testing.T) {
	world := &World{
		ItemInventoryStatus: "available",
		Bases: []BaseCamp{
			{ID: "base-near", GuildID: "guild-a", Position: &Vector{X: 0, Y: 0}, AreaRange: 100},
			{ID: "base-other-guild", GuildID: "guild-b", Position: &Vector{X: 0, Y: 0}, AreaRange: 100},
		},
		ItemStacks: []ItemStack{{
			ContainerID: "container-1", GuildID: "guild-a", ItemID: "Wood", Quantity: 10,
			ContainerType: "unknown", SlotIndex: 2,
		}},
	}
	owners := map[string]itemContainerOwnership{
		"container-1": {
			ContainerID: "container-1", Position: Vector{X: 25, Y: 10},
			UsageType: itemContainerUsageStorage,
			SlotAttributes: map[int]uint8{2: itemSlotAttributePublicOutput},
		},
	}

	assignItemStackOwnership(world, owners)
	stack := world.ItemStacks[0]
	if stack.BaseID != "base-near" || stack.ContainerType != "production_output" {
		t.Fatalf("confirmed ownership was not applied: %#v", stack)
	}
	if world.ItemInventoryStatus != "available" {
		t.Fatalf("status = %q; want available", world.ItemInventoryStatus)
	}

	world.Bases = append(world.Bases, BaseCamp{
		ID: "base-overlap", GuildID: "guild-a", Position: &Vector{X: 20, Y: 10}, AreaRange: 100,
	})
	world.ItemStacks[0].BaseID = ""
	world.ItemStacks[0].ContainerType = "unknown"
	assignItemStackOwnership(world, owners)
	if world.ItemStacks[0].BaseID != "" || world.ItemStacks[0].ContainerType != "unknown" {
		t.Fatalf("ambiguous ownership was guessed: %#v", world.ItemStacks[0])
	}
	if world.ItemInventoryStatus != "partial" {
		t.Fatalf("ambiguous status = %q; want partial", world.ItemInventoryStatus)
	}
}

func TestClassifyItemContainerSlotsFailsClosed(t *testing.T) {
	tests := []struct {
		name      string
		attribute uint8
		expected  string
	}{
		{name: "ordinary storage", attribute: itemSlotAttributeUndefined, expected: "storage_box"},
		{name: "input stays unavailable", attribute: itemSlotAttributeInput, expected: "unknown"},
		{name: "public output", attribute: itemSlotAttributePublicOutput, expected: "production_output"},
		{name: "food provider", attribute: itemSlotAttributeFoodProvidable, expected: "feed_box"},
		{name: "non-transportable storage", attribute: itemSlotAttributeCannotTransport, expected: "storage_box"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual := classifyItemContainerSlot(
				itemContainerUsageStorage,
				map[int]uint8{4: test.attribute},
				4,
			)
			if actual != test.expected {
				t.Fatalf("classification = %q; want %q", actual, test.expected)
			}
		})
	}
	if actual := classifyItemContainerSlot(0, nil, 4); actual != "unknown" {
		t.Fatalf("unsupported usage was classified as %q", actual)
	}
}

func writeRepeatedTestGUID(t *testing.T, destination *bytes.Buffer, value byte) {
	t.Helper()
	if _, err := destination.Write(bytes.Repeat([]byte{value}, 16)); err != nil {
		t.Fatal(err)
	}
}

func writeTestANSIString(t *testing.T, destination *bytes.Buffer, value string) {
	t.Helper()
	writeTestInt32(t, destination, int32(len(value)+1))
	if _, err := destination.Write(append([]byte(value), 0)); err != nil {
		t.Fatal(err)
	}
}

func writeTestUint32(t *testing.T, destination *bytes.Buffer, value uint32) {
	t.Helper()
	if err := binary.Write(destination, binary.LittleEndian, value); err != nil {
		t.Fatal(err)
	}
}

func writeTestInt32(t *testing.T, destination *bytes.Buffer, value int32) {
	t.Helper()
	if err := binary.Write(destination, binary.LittleEndian, value); err != nil {
		t.Fatal(err)
	}
}
