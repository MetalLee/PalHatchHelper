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
			"Slots": testStructProperty(propertyMap{
				"Slots": {Value: []any{
					propertyMap{"RawData": {Value: testItemSlotRaw(t, 4, 120, "Wood")}},
					propertyMap{"RawData": {Value: testItemSlotRaw(t, 7, 0, "None")}},
				}},
			}),
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
		items[0].Quantity != 120 || items[0].SlotIndex != 4 {
		t.Fatalf("item stack facts changed: %#v", items[0])
	}
	if items[0].ContainerType != "unknown" || items[0].BaseID != "" {
		t.Fatalf("unconfirmed ownership was guessed: %#v", items[0])
	}
}

func TestItemContainerSlotsDecodeDirectRetailArray(t *testing.T) {
	const containerID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	entry := mapEntry{
		Key: propertyMap{"ID": testStructProperty(containerID)},
		Value: structData{Value: propertyMap{
			"Slots": {Value: []any{
				propertyMap{"RawData": {Value: testItemSlotRaw(t, 4, 120, "Wood")}},
				propertyMap{"RawData": {Value: testItemSlotRaw(t, 7, 0, "None")}},
			}},
		}},
	}
	stats := newStats()
	items, complete := itemStacksFromEntry(entry, &stats)
	if !complete || len(items) != 1 {
		t.Fatalf("direct retail slot array was not decoded: complete=%v items=%#v skips=%#v", complete, items, stats.SkippedDetails)
	}
	if items[0].ContainerID != containerID || items[0].ItemID != "Wood" ||
		items[0].Quantity != 120 || items[0].SlotIndex != 4 {
		t.Fatalf("item stack facts changed: %#v", items[0])
	}
}

func TestItemContainerStructuralDriftIsPartial(t *testing.T) {
	entry := mapEntry{
		Key: propertyMap{"ID": testStructProperty("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")},
		Value: structData{Value: propertyMap{
			"Slots": testStructProperty(propertyMap{
				"Slots": {Value: []any{"not-a-slot"}},
			}),
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
	writeTestUint32(t, &raw, 0)

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
	const baseID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	const guildID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	const containerID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
	moduleRaw := testItemContainerModuleRaw(t, 0, itemSlotAttributeUndefined)
	modelRaw := testMapModelRaw(t, 0xaa, 0xbb, Vector{X: 10, Y: 20, Z: 30})

	root := propertyMap{
		"MapObjectSaveData": {Value: []any{
			propertyMap{
				"MapObjectId": {Value: "ItemChest"},
				"Model": testStructProperty(propertyMap{
					"RawData": {Value: modelRaw},
					"BuildProcess": testStructProperty(propertyMap{
						"RawData": {Value: testCompletedBuildProcessRaw(t)},
					}),
				}),
				"ConcreteModel": testStructProperty(propertyMap{
					"ModuleMap": {Value: []mapEntry{{
						Key:   "EPalMapObjectConcreteModelModuleType::ItemContainer",
						Value: structData{Value: propertyMap{"RawData": {Value: moduleRaw}}},
					}}},
				}),
			},
		}},
	}
	stats := newStats()
	owners := itemContainerOwnershipsFromRoot(root, &stats)
	owner, ok := owners[guidIdentityKey(containerID)]
	if !ok || owner.Position != (Vector{X: 10, Y: 20, Z: 30}) {
		t.Fatalf("map object ownership was not decoded: %#v", owners)
	}
	if owner.BaseID != baseID || owner.GuildID != guildID {
		t.Fatalf("confirmed map ownership changed: %#v", owner)
	}
	if stats.DecodeFailures["item_container_ownership"] != 0 {
		t.Fatalf("valid ownership recorded a failure: %#v", stats.DecodeFailures)
	}
}

func TestDecodeMapObjectModelRawAcceptsOpaqueStageValidity(t *testing.T) {
	raw := testMapModelRaw(t, 0xaa, 0xbb, Vector{X: 10, Y: 20, Z: 30})
	binary.LittleEndian.PutUint32(raw[len(raw)-4:], 502388096)

	baseID, guildID, position, ok := decodeMapObjectModelRaw(raw)
	if !ok {
		t.Fatal("opaque stage validity token rejected")
	}
	if baseID == "" || guildID == "" || position != (Vector{X: 10, Y: 20, Z: 30}) {
		t.Fatalf("map model facts changed: base=%q guild=%q position=%#v", baseID, guildID, position)
	}
}

func TestAssignItemStackOwnershipUsesExplicitMapObjectBase(t *testing.T) {
	world := &World{
		ItemInventoryStatus: "available",
		Bases: []BaseCamp{
			{ID: "base-near", GuildID: "guild-a", Position: &Vector{X: 0, Y: 0}, AreaRange: 100},
			{ID: "base-other-guild", GuildID: "guild-b", Position: &Vector{X: 0, Y: 0}, AreaRange: 100},
		},
		ItemStacks: []ItemStack{{
			ContainerID: "container-1", ItemID: "Wood", Quantity: 10,
			ContainerType: "unknown", SlotIndex: 2,
		}},
	}
	owners := map[string]itemContainerOwnership{
		guidIdentityKey("container-1"): {
			ContainerID: "container-1", BaseID: "base-near", GuildID: "guild-a",
			Position:       Vector{X: 25, Y: 10},
			UsageType:      itemContainerUsageStorage,
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

	owners[guidIdentityKey("container-1")] = itemContainerOwnership{
		ContainerID: "container-1", BaseID: "missing-base", GuildID: "guild-a",
		Position: Vector{X: 25, Y: 10}, UsageType: itemContainerUsageStorage,
		SlotAttributes: map[int]uint8{2: itemSlotAttributePublicOutput},
	}
	world.ItemStacks[0].BaseID = ""
	world.ItemStacks[0].GuildID = ""
	world.ItemStacks[0].ContainerType = "unknown"
	assignItemStackOwnership(world, owners)
	if world.ItemStacks[0].BaseID != "" || world.ItemStacks[0].ContainerType != "unknown" {
		t.Fatalf("unknown direct ownership was guessed: %#v", world.ItemStacks[0])
	}
	if world.ItemInventoryStatus != "partial" {
		t.Fatalf("unresolved status = %q; want partial", world.ItemInventoryStatus)
	}
}

func TestGuildItemContainerOwnershipUsesGuildExtraStorageGUID(t *testing.T) {
	const guildID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	const containerID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
	var raw bytes.Buffer
	writeRepeatedTestGUID(t, &raw, 0xcc)
	raw.Write([]byte{1, 2, 3, 4}) // trailing version bytes are opaque
	root := propertyMap{
		"GuildExtraSaveDataMap": {Value: []mapEntry{{
			Key: guildID,
			Value: structData{Value: propertyMap{
				"GuildItemStorage": testStructProperty(propertyMap{
					"RawData": {Value: raw.Bytes()},
				}),
			}},
		}}},
	}
	world := &World{
		ItemInventoryStatus: "available",
		Guilds:              []Guild{{ID: guildID}},
		ItemStacks: []ItemStack{{
			ContainerID:   containerID,
			ItemID:        "Wood",
			Quantity:      10,
			ContainerType: "unknown",
			SlotIndex:     0,
		}},
	}
	stats := newStats()
	owners := guildItemContainerOwnershipsFromRoot(root, world.Guilds, &stats)
	assignGuildItemStackOwnership(world, owners)
	assignItemStackOwnership(world, nil)

	if len(world.ItemStacks) != 1 || world.ItemStacks[0].ContainerType != "guild_chest" ||
		world.ItemStacks[0].GuildID != guildID || world.ItemStacks[0].BaseID != "" {
		t.Fatalf("guild chest ownership was not preserved: %#v", world.ItemStacks)
	}
	if world.ItemInventoryStatus != "available" {
		t.Fatalf("guild chest was treated as unresolved: %q", world.ItemInventoryStatus)
	}
}

func TestGuildItemContainerOwnershipConflictFailsClosed(t *testing.T) {
	const containerID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
	key := guidIdentityKey(containerID)
	baseOwners := map[string]itemContainerOwnership{
		key: {ContainerID: containerID, BaseID: "base-1", GuildID: "guild-1"},
	}
	guildOwners := map[string]string{key: "guild-1"}
	stats := newStats()

	rejectConflictingItemContainerOwnerships(baseOwners, guildOwners, &stats)

	if len(baseOwners) != 0 || len(guildOwners) != 0 {
		t.Fatalf("conflicting ownership evidence was retained: %#v %#v", baseOwners, guildOwners)
	}
	if stats.DecodeFailures["item_container_ownership"] != 1 {
		t.Fatalf("ownership conflict was not diagnosed: %#v", stats.DecodeFailures)
	}
}

func TestExcludePlayerItemContainersRemovesBackpacksBeforeOwnership(t *testing.T) {
	world := &World{
		ItemInventoryStatus: "available",
		Players: []Player{{
			ItemContainerIDs: []string{"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},
		}},
		ItemStacks: []ItemStack{
			{
				ContainerID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
				ItemID:      "Wood", Quantity: 10, ContainerType: "unknown", SlotIndex: 0,
			},
			{
				ContainerID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
				ItemID:      "Stone", Quantity: 20, ContainerType: "unknown", SlotIndex: 0,
			},
		},
	}

	excludePlayerItemContainers(world)

	if len(world.ItemStacks) != 1 ||
		world.ItemStacks[0].ContainerID != "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" {
		t.Fatalf("personal item inventory leaked into base inventory: %#v", world.ItemStacks)
	}
}

func TestPlayerItemContainerIDsReadsInventoryInfo(t *testing.T) {
	data := propertyMap{
		"InventoryInfo": testStructProperty(propertyMap{
			"CommonContainerId": testStructProperty(propertyMap{
				"ID": {Value: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},
			}),
			"DropSlotContainerId": testStructProperty(propertyMap{
				"ID": {Value: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"},
			}),
			"EssentialContainerId": testStructProperty(propertyMap{
				"ID": {Value: "00000000-0000-0000-0000-000000000000"},
			}),
		}),
	}

	actual := playerItemContainerIDs(data)

	if len(actual) != 2 ||
		actual[0] != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" ||
		actual[1] != "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" {
		t.Fatalf("player item containers changed: %#v", actual)
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
	if actual := classifyItemContainerSlot(
		itemContainerUsageStorage,
		map[int]uint8{4: itemSlotAttributeUndefined},
		4,
		"Refrigerator",
	); actual != "refrigerator" {
		t.Fatalf("refrigerated storage was classified as %q", actual)
	}
}

func TestClassifyItemContainerDefaultsFromConfirmedPhysicalMapObject(t *testing.T) {
	tests := []struct {
		mapObjectID string
		expected    string
	}{
		{mapObjectID: "ItemChest_03", expected: "storage_box"},
		{mapObjectID: "Barrel_Wood", expected: "storage_box"},
		{mapObjectID: "Shelf02_Stone", expected: "storage_box"},
		{mapObjectID: "CoolerBox", expected: "refrigerator"},
		{mapObjectID: "Refrigerator", expected: "refrigerator"},
		{mapObjectID: "CoolerPalFoodBox", expected: "feed_box"},
		{mapObjectID: "FishingPond2", expected: "production_output"},
	}
	for _, test := range tests {
		t.Run(test.mapObjectID, func(t *testing.T) {
			actual := classifyItemContainerSlot(
				itemContainerUsageStorage,
				map[int]uint8{},
				4,
				test.mapObjectID,
			)
			if actual != test.expected {
				t.Fatalf("classification = %q; want %q", actual, test.expected)
			}
		})
	}

	if actual := classifyItemContainerSlot(
		itemContainerUsageStorage,
		map[int]uint8{},
		4,
		"UnknownContainer",
	); actual != "unknown" {
		t.Fatalf("unknown map object was guessed as %q", actual)
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

func testItemSlotRaw(t *testing.T, slotIndex, count int32, itemID string) []byte {
	t.Helper()
	var raw bytes.Buffer
	writeTestInt32(t, &raw, slotIndex)
	writeTestInt32(t, &raw, count)
	writeTestANSIString(t, &raw, itemID)
	writeRepeatedTestGUID(t, &raw, 0x11)
	writeRepeatedTestGUID(t, &raw, 0x22)
	return raw.Bytes()
}

func testItemContainerModuleRaw(t *testing.T, slotIndex int32, attribute uint8) []byte {
	t.Helper()
	var raw bytes.Buffer
	writeRepeatedTestGUID(t, &raw, 0xcc)
	writeTestUint32(t, &raw, 1)
	raw.WriteByte(attribute)
	writeTestUint32(t, &raw, 1)
	writeTestInt32(t, &raw, slotIndex)
	writeTestUint32(t, &raw, uint32(slotIndex+1))
	for index := int32(0); index <= slotIndex; index++ {
		raw.WriteByte(attribute)
	}
	writeTestUint32(t, &raw, 0)
	raw.WriteByte(itemContainerUsageStorage)
	writeTestUint32(t, &raw, 0)
	return raw.Bytes()
}

func testMapModelRaw(
	t *testing.T,
	baseIDByte, guildIDByte byte,
	position Vector,
) []byte {
	t.Helper()
	var raw bytes.Buffer
	writeRepeatedTestGUID(t, &raw, 0x31)
	writeRepeatedTestGUID(t, &raw, 0x32)
	writeRepeatedTestGUID(t, &raw, baseIDByte)
	writeRepeatedTestGUID(t, &raw, guildIDByte)
	writeTestInt32(t, &raw, 100)
	writeTestInt32(t, &raw, 100)
	for _, value := range []float64{
		0, 0, 0, 1,
		position.X, position.Y, position.Z,
		1, 1, 1,
	} {
		if err := binary.Write(&raw, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	for value := byte(0x41); value <= 0x44; value++ {
		writeRepeatedTestGUID(t, &raw, value)
	}
	raw.WriteByte(1)
	if err := binary.Write(&raw, binary.LittleEndian, float32(0)); err != nil {
		t.Fatal(err)
	}
	writeRepeatedTestGUID(t, &raw, 0x45)
	writeTestUint32(t, &raw, 1)
	return raw.Bytes()
}

func testCompletedBuildProcessRaw(t *testing.T) []byte {
	t.Helper()
	var raw bytes.Buffer
	raw.WriteByte(1)
	writeRepeatedTestGUID(t, &raw, 0x51)
	writeTestUint32(t, &raw, 0)
	return raw.Bytes()
}
