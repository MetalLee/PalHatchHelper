// Modified by PalHatchHelper from 8tp/palhelm commit e099e8afe4823d6cf6b371e5e3938955e5a1becd.
package sav

import (
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// ParseLevel parses Level.sav and optional player saves into a typed World.
func ParseLevel(path string, opts Options) (*World, error) {
	raw, err := readSave(path)
	if err != nil {
		return nil, err
	}
	stats := newStats()
	g, err := parseGVAS(raw, &stats)
	if err != nil {
		return nil, err
	}
	w := &World{
		Players: []Player{}, Pals: []Pal{}, Guilds: []Guild{}, Bases: []BaseCamp{},
		ItemStacks: []ItemStack{}, ItemInventoryStatus: "unavailable", Stats: stats,
	}
	w.Meta = metaFromProperties(g.Properties)
	levelWorldUID := w.Meta.WorldUID
	metaPath := filepath.Join(filepath.Dir(path), "LevelMeta.sav")
	if !strings.EqualFold(filepath.Base(path), "LevelMeta.sav") {
		if meta, metaErr := ParseLevelMeta(metaPath); metaErr == nil {
			w.Meta = *meta
			if w.Meta.WorldUID == "" {
				w.Meta.WorldUID = levelWorldUID
			}
		} else if !errors.Is(metaErr, os.ErrNotExist) {
			w.Stats.DecodeFailures["meta"]++
		}
	}
	extractWorldSaveData(w, g.Properties)
	if err := loadPlayerDirectory(w, path, opts); err != nil {
		return nil, err
	}
	if root, ok := propertyProperties(g.Properties, "worldSaveData"); ok {
		excludePlayerItemContainers(w)
		assignItemStackOwnership(w, itemContainerOwnershipsFromRoot(root, &w.Stats))
	}
	return w, nil
}

// extractWorldSaveData derives players, pals, guilds and bases from the parsed
// worldSaveData property tree. Split out from ParseLevel so tests can exercise
// it against synthetic GVAS bytes without the Oodle container layer.
func extractWorldSaveData(w *World, props propertyMap) {
	root, ok := propertyProperties(props, "worldSaveData")
	if !ok {
		return
	}
	if p := root["GroupSaveDataMap"]; p != nil {
		entries, ok := p.Value.([]mapEntry)
		if !ok {
			w.Stats.DecodeFailures["guilds"]++
		} else {
			for _, e := range entries {
				decodeGuildEntry(w, e)
			}
		}
	}
	if p := root["CharacterSaveParameterMap"]; p != nil {
		entries, ok := p.Value.([]mapEntry)
		if !ok {
			w.Stats.DecodeFailures["characters"]++
		} else {
			for _, e := range entries {
				pl, pal, e2 := characterFromEntry(e, &w.Stats)
				if e2 != nil {
					w.Stats.DecodeFailures["characters"]++
					continue
				}
				if pl != nil {
					w.Players = append(w.Players, *pl)
				}
				if pal != nil {
					w.Pals = append(w.Pals, *pal)
				}
			}
		}
	}
	if p := root["BaseCampSaveData"]; p != nil {
		if entries, ok := p.Value.([]mapEntry); ok {
			for _, e := range entries {
				w.Bases = append(w.Bases, baseFromEntry(e, &w.Stats))
			}
		} else {
			w.Stats.DecodeFailures["bases"]++
		}
	}
	if p := root["ItemContainerSaveData"]; p != nil {
		if entries, ok := p.Value.([]mapEntry); ok {
			w.ItemInventoryStatus = "available"
			for _, e := range entries {
				stacks, complete := itemStacksFromEntry(e, &w.Stats)
				w.ItemStacks = append(w.ItemStacks, stacks...)
				if !complete {
					w.ItemInventoryStatus = "partial"
				}
			}
		} else {
			w.ItemInventoryStatus = "partial"
			w.Stats.DecodeFailures["item_containers"]++
		}
	}
	assignBaseGuilds(w)
	assignBaseWorkers(w)
}

func itemStacksFromEntry(e mapEntry, stats *ParseStats) ([]ItemStack, bool) {
	containerID := itemContainerIDFromMapKey(e.Key)
	value, ok := asProperties(e.Value)
	if !ok || containerID == "" {
		stats.recordSkip("worldSaveData.ItemContainerSaveData", "invalid-container")
		return nil, false
	}
	slotsProperty := value["Slots"]
	if slotsProperty == nil {
		stats.recordSkip("worldSaveData.ItemContainerSaveData.Value.Slots", "missing")
		return nil, false
	}
	values, ok := slotsProperty.Value.([]any)
	if !ok {
		// Older decoded fixtures represented the ArrayProperty metadata as a
		// nested struct. Keep accepting that shape while preferring the direct
		// []any emitted by current retail saves.
		slots, nested := asProperties(slotsProperty.Value)
		if !nested || slots["Slots"] == nil {
			stats.recordSkip("worldSaveData.ItemContainerSaveData.Value.Slots", "invalid-array")
			return nil, false
		}
		values, ok = slots["Slots"].Value.([]any)
	}
	if !ok {
		stats.recordSkip("worldSaveData.ItemContainerSaveData.Value.Slots", "invalid-array")
		return nil, false
	}
	result := make([]ItemStack, 0, len(values))
	complete := true
	seenSlots := make(map[int]struct{}, len(values))
	for _, value := range values {
		slot, ok := asProperties(value)
		if !ok {
			stats.recordSkip("worldSaveData.ItemContainerSaveData.Value.Slots", "invalid-slot")
			complete = false
			continue
		}
		raw, ok := propertyBytes(slot, "RawData")
		if !ok {
			stats.recordSkip("worldSaveData.ItemContainerSaveData.Value.Slots[].RawData", "missing")
			complete = false
			continue
		}
		decoded, ok := decodeItemSlotRaw(raw)
		if !ok {
			stats.recordSkip("worldSaveData.ItemContainerSaveData.Value.Slots[].RawData", "invalid-item-stack")
			complete = false
			continue
		}
		if _, duplicate := seenSlots[decoded.SlotIndex]; duplicate {
			stats.recordSkip("worldSaveData.ItemContainerSaveData.Value.Slots[].RawData", "duplicate-slot")
			complete = false
			continue
		}
		seenSlots[decoded.SlotIndex] = struct{}{}
		if decoded.ItemID == "None" || decoded.Quantity == 0 {
			continue
		}
		result = append(result, ItemStack{
			ContainerID:   containerID,
			ItemID:        decoded.ItemID,
			Quantity:      decoded.Quantity,
			ContainerType: "unknown",
			SlotIndex:     decoded.SlotIndex,
		})
	}
	return result, complete
}

type decodedItemSlot struct {
	SlotIndex int
	Quantity  int
	ItemID    string
}

// decodeItemSlotRaw decodes the proven retail ItemContainer slot prefix. The
// dynamic item GUIDs and any version-specific trailing bytes are deliberately
// ignored after their boundaries have been verified.
func decodeItemSlotRaw(raw []byte) (decodedItemSlot, bool) {
	r := newReader(raw)
	slotIndex, err := r.i32()
	if err != nil || slotIndex < 0 || slotIndex > 100000 {
		return decodedItemSlot{}, false
	}
	quantity, err := r.i32()
	if err != nil || quantity < 0 {
		return decodedItemSlot{}, false
	}
	itemID, err := r.fstring()
	if err != nil || strings.TrimSpace(itemID) == "" {
		return decodedItemSlot{}, false
	}
	if _, err = readGUID(r); err != nil {
		return decodedItemSlot{}, false
	}
	if _, err = readGUID(r); err != nil {
		return decodedItemSlot{}, false
	}
	return decodedItemSlot{
		SlotIndex: int(slotIndex),
		Quantity:  int(quantity),
		ItemID:    strings.TrimSpace(itemID),
	}, true
}

func itemContainerIDFromMapKey(value any) string {
	if direct, ok := value.(string); ok {
		return strings.TrimSpace(direct)
	}
	properties, ok := asProperties(value)
	if !ok {
		return ""
	}
	return strings.TrimSpace(firstString(properties, "ID", "Id"))
}

const (
	itemSlotAttributeUndefined       uint8 = 0
	itemSlotAttributeInput           uint8 = 1
	itemSlotAttributePublicOutput    uint8 = 2
	itemSlotAttributeFoodProvidable  uint8 = 3
	itemSlotAttributeCannotTransport uint8 = 4
	itemContainerUsageStorage        uint8 = 1
	maxItemContainerSlots                  = 1 << 20
)

type itemContainerOwnership struct {
	ContainerID    string
	BaseID         string
	GuildID        string
	MapObjectID    string
	Position       Vector
	UsageType      uint8
	SlotAttributes map[int]uint8
}

// itemContainerOwnershipsFromRoot joins only the structural MapObject module
// that explicitly targets an ItemContainerSaveData GUID. Base and guild
// ownership come from Model.RawData; position is only a consistency check and
// is never used to infer a nearby base.
func itemContainerOwnershipsFromRoot(root propertyMap, stats *ParseStats) map[string]itemContainerOwnership {
	property := root["MapObjectSaveData"]
	if property == nil {
		return nil
	}
	values, ok := property.Value.([]any)
	if !ok {
		return nil
	}
	owners := make(map[string]itemContainerOwnership)
	ambiguous := make(map[string]bool)
	for _, value := range values {
		object, ok := asProperties(value)
		if !ok {
			continue
		}
		model, ok := propertyProperties(object, "Model")
		if !ok {
			continue
		}
		modelRaw, ok := propertyBytes(model, "RawData")
		if !ok {
			stats.DecodeFailures["item_container_ownership"]++
			continue
		}
		baseID, guildID, position, ok := decodeMapObjectModelRaw(modelRaw)
		if !ok {
			stats.DecodeFailures["item_container_ownership"]++
			continue
		}
		buildProcess, ok := propertyProperties(model, "BuildProcess")
		if !ok {
			continue
		}
		buildRaw, ok := propertyBytes(buildProcess, "RawData")
		if !ok || !decodeCompletedBuildProcessRaw(buildRaw) {
			continue
		}
		concreteModel, ok := propertyProperties(object, "ConcreteModel")
		if !ok {
			continue
		}
		modules, ok := propertyMapEntries(concreteModel, "ModuleMap")
		if !ok {
			continue
		}
		for _, moduleEntry := range modules {
			if !isItemContainerModuleKey(moduleEntry.Key) {
				continue
			}
			module, ok := asProperties(moduleEntry.Value)
			if !ok {
				stats.DecodeFailures["item_container_ownership"]++
				continue
			}
			raw, ok := propertyBytes(module, "RawData")
			if !ok {
				stats.DecodeFailures["item_container_ownership"]++
				continue
			}
			decoded, ok := decodeItemContainerModuleRaw(raw)
			if !ok {
				stats.DecodeFailures["item_container_ownership"]++
				continue
			}
			decoded.Position = position
			decoded.BaseID = baseID
			decoded.GuildID = guildID
			decoded.MapObjectID = strings.TrimSpace(firstString(object, "MapObjectId", "MapObjectID"))
			key := guidIdentityKey(decoded.ContainerID)
			if _, exists := owners[key]; exists {
				delete(owners, key)
				ambiguous[key] = true
				continue
			}
			if !ambiguous[key] {
				owners[key] = decoded
			}
		}
	}
	return owners
}

func decodeMapObjectModelRaw(raw []byte) (string, string, Vector, bool) {
	r := newReader(raw)
	instanceID, err := readGUID(r)
	if err != nil || zeroGUID(instanceID) {
		return "", "", Vector{}, false
	}
	concreteID, err := readGUID(r)
	if err != nil || zeroGUID(concreteID) {
		return "", "", Vector{}, false
	}
	baseID, err := readGUID(r)
	if err != nil {
		return "", "", Vector{}, false
	}
	guildID, err := readGUID(r)
	if err != nil {
		return "", "", Vector{}, false
	}
	if _, err = r.i32(); err != nil {
		return "", "", Vector{}, false
	}
	if _, err = r.i32(); err != nil {
		return "", "", Vector{}, false
	}
	for range 4 {
		value, readErr := r.f64()
		if readErr != nil || !finiteBaseCoord(value) {
			return "", "", Vector{}, false
		}
	}
	position := Vector{}
	if position.X, err = r.f64(); err != nil || !finiteBaseCoord(position.X) {
		return "", "", Vector{}, false
	}
	if position.Y, err = r.f64(); err != nil || !finiteBaseCoord(position.Y) {
		return "", "", Vector{}, false
	}
	if position.Z, err = r.f64(); err != nil || !finiteBaseCoord(position.Z) {
		return "", "", Vector{}, false
	}
	for range 3 {
		value, readErr := r.f64()
		if readErr != nil || !finiteBaseCoord(value) {
			return "", "", Vector{}, false
		}
	}
	for range 4 {
		if _, err = readGUID(r); err != nil {
			return "", "", Vector{}, false
		}
	}
	if _, err = r.u8(); err != nil {
		return "", "", Vector{}, false
	}
	damage, err := r.f32()
	if err != nil || math.IsNaN(float64(damage)) || math.IsInf(float64(damage), 0) {
		return "", "", Vector{}, false
	}
	if _, err = readGUID(r); err != nil {
		return "", "", Vector{}, false
	}
	// The field is serialized as an opaque uint32 token rather than a boolean;
	// current retail saves legitimately use values outside 0 and 1.
	if _, err = r.u32(); err != nil {
		return "", "", Vector{}, false
	}
	return baseID, guildID, position, true
}

func decodeCompletedBuildProcessRaw(raw []byte) bool {
	r := newReader(raw)
	state, err := r.u8()
	if err != nil {
		return false
	}
	if _, err = readGUID(r); err != nil {
		return false
	}
	if err = r.skip(4); err != nil {
		return false
	}
	return state == 1
}

func zeroGUID(value string) bool {
	return guidIdentityKey(value) == strings.Repeat("0", 32)
}

func isItemContainerModuleKey(value any) bool {
	var key string
	switch typed := value.(type) {
	case string:
		key = typed
	case enumData:
		key = typed.Value
	default:
		return false
	}
	key = strings.TrimSpace(key)
	return key == "ItemContainer" || strings.HasSuffix(key, "::ItemContainer")
}

// decodeItemContainerModuleRaw decodes the confirmed retail 1.x payload:
// target container GUID, grouped slot indexes, the complete per-slot attribute
// array, drop flag and EPalContainerUsageType. Any count, duplicate or trailing
// byte drift fails closed so a future layout cannot silently misclassify stock.
func decodeItemContainerModuleRaw(raw []byte) (itemContainerOwnership, bool) {
	r := newReader(raw)
	containerID, err := readGUID(r)
	if err != nil || guidIdentityKey(containerID) == strings.Repeat("0", 32) {
		return itemContainerOwnership{}, false
	}
	groupCount, err := r.u32()
	if err != nil || groupCount > maxItemContainerSlots {
		return itemContainerOwnership{}, false
	}
	grouped := make(map[int]uint8)
	for range groupCount {
		attribute, readErr := r.u8()
		if readErr != nil {
			return itemContainerOwnership{}, false
		}
		indexCount, readErr := r.u32()
		if readErr != nil || indexCount > maxItemContainerSlots || uint64(indexCount)*4 > uint64(r.remaining()) {
			return itemContainerOwnership{}, false
		}
		for range indexCount {
			index, indexErr := r.i32()
			if indexErr != nil || index < 0 || index >= maxItemContainerSlots {
				return itemContainerOwnership{}, false
			}
			if previous, exists := grouped[int(index)]; exists && previous != attribute {
				return itemContainerOwnership{}, false
			}
			grouped[int(index)] = attribute
		}
	}
	attributeCount, err := r.u32()
	if err != nil || attributeCount > maxItemContainerSlots || uint64(attributeCount) > uint64(r.remaining()) {
		return itemContainerOwnership{}, false
	}
	attributes, err := r.read(int(attributeCount))
	if err != nil {
		return itemContainerOwnership{}, false
	}
	allAttributes := make(map[int]uint8, len(attributes))
	for index, attribute := range attributes {
		if groupedAttribute, exists := grouped[index]; exists && groupedAttribute != attribute {
			return itemContainerOwnership{}, false
		}
		allAttributes[index] = attribute
	}
	for index := range grouped {
		if index >= len(attributes) {
			return itemContainerOwnership{}, false
		}
	}
	dropItem, err := r.u32()
	if err != nil || dropItem > 1 {
		return itemContainerOwnership{}, false
	}
	usageType, err := r.u8()
	if err != nil {
		return itemContainerOwnership{}, false
	}
	if err = r.skip(4); err != nil || r.remaining() != 0 {
		return itemContainerOwnership{}, false
	}
	return itemContainerOwnership{
		ContainerID:    containerID,
		UsageType:      usageType,
		SlotAttributes: allAttributes,
	}, true
}

func classifyItemContainerSlot(
	usageType uint8,
	attributes map[int]uint8,
	slotIndex int,
	mapObjectID ...string,
) string {
	if usageType != itemContainerUsageStorage || slotIndex < 0 {
		return "unknown"
	}
	attribute, ok := attributes[slotIndex]
	if !ok {
		if len(mapObjectID) > 0 {
			return confirmedPhysicalContainerType(mapObjectID[0])
		}
		return "unknown"
	}
	switch attribute {
	case itemSlotAttributeUndefined, itemSlotAttributeCannotTransport:
		if len(mapObjectID) > 0 && isRefrigeratedMapObject(mapObjectID[0]) {
			return "refrigerator"
		}
		return "storage_box"
	case itemSlotAttributePublicOutput:
		return "production_output"
	case itemSlotAttributeFoodProvidable:
		return "feed_box"
	case itemSlotAttributeInput:
		return "unknown"
	default:
		return "unknown"
	}
}

// confirmedPhysicalContainerType handles retail storage modules that omit a
// per-slot attribute for their default slots. Only stable map-object IDs
// observed for specification-allowed physical containers are accepted; every
// unrecognized or production-input object remains unresolved.
func confirmedPhysicalContainerType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "itemchest", "itemchest_02", "itemchest_03", "itemchest_04",
		"barrel_wood", "shelf01_wall_iron", "shelf02_stone", "shelf03_stone":
		return "storage_box"
	case "coolerbox", "refrigerator":
		return "refrigerator"
	case "coolerpalfoodbox":
		return "feed_box"
	case "fishingpond2":
		return "production_output"
	default:
		return "unknown"
	}
}

func isRefrigeratedMapObject(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "coolerbox", "refrigerator":
		return true
	default:
		return false
	}
}

func assignItemStackOwnership(w *World, owners map[string]itemContainerOwnership) {
	if w.ItemInventoryStatus == "unavailable" {
		return
	}
	partial := w.ItemInventoryStatus == "partial"
	resolvedOrUnresolved := make([]ItemStack, 0, len(w.ItemStacks))
	for i := range w.ItemStacks {
		stack := w.ItemStacks[i]
		owner, ok := owners[guidIdentityKey(stack.ContainerID)]
		if !ok {
			partial = true
			resolvedOrUnresolved = append(resolvedOrUnresolved, stack)
			continue
		}
		if zeroGUID(owner.BaseID) && zeroGUID(owner.GuildID) {
			continue
		}
		attribute, hasAttribute := owner.SlotAttributes[stack.SlotIndex]
		if hasAttribute && attribute == itemSlotAttributeInput {
			continue
		}
		baseID, guildID, ok := confirmedDirectBaseOwnership(w.Bases, owner)
		containerType := classifyItemContainerSlot(
			owner.UsageType,
			owner.SlotAttributes,
			stack.SlotIndex,
			owner.MapObjectID,
		)
		if !ok || containerType == "unknown" {
			partial = true
			resolvedOrUnresolved = append(resolvedOrUnresolved, stack)
			continue
		}
		stack.BaseID = baseID
		stack.GuildID = guildID
		stack.ContainerType = containerType
		resolvedOrUnresolved = append(resolvedOrUnresolved, stack)
	}
	w.ItemStacks = resolvedOrUnresolved
	if partial {
		w.ItemInventoryStatus = "partial"
	} else {
		w.ItemInventoryStatus = "available"
	}
}

func confirmedDirectBaseOwnership(
	bases []BaseCamp,
	owner itemContainerOwnership,
) (string, string, bool) {
	if zeroGUID(owner.BaseID) || zeroGUID(owner.GuildID) {
		return "", "", false
	}
	for _, base := range bases {
		if guidIdentityKey(base.ID) != guidIdentityKey(owner.BaseID) {
			continue
		}
		if base.GuildID == "" || guidIdentityKey(base.GuildID) != guidIdentityKey(owner.GuildID) {
			return "", "", false
		}
		if base.Position != nil && finiteBaseRange(base.AreaRange) {
			dx := owner.Position.X - base.Position.X
			dy := owner.Position.Y - base.Position.Y
			if dx*dx+dy*dy > base.AreaRange*base.AreaRange {
				return "", "", false
			}
		}
		return base.ID, base.GuildID, true
	}
	return "", "", false
}

// ParseLevelMeta parses a LevelMeta.sav file.
func ParseLevelMeta(path string) (*WorldMeta, error) {
	raw, err := readSave(path)
	if err != nil {
		return nil, err
	}
	stats := newStats()
	g, err := parseGVAS(raw, &stats)
	if err != nil {
		return nil, err
	}
	m := metaFromProperties(g.Properties)
	return &m, nil
}

func decodeGuildEntry(w *World, e mapEntry) {
	v, ok := asProperties(e.Value)
	if !ok {
		w.Stats.DecodeFailures["guilds"]++
		return
	}
	t := firstString(v, "GroupType")
	rawProp := v["RawData"]
	if rawProp == nil {
		w.Stats.DecodeFailures["guilds"]++
		return
	}
	raw, ok := rawProp.Value.([]byte)
	if !ok {
		w.Stats.DecodeFailures["guilds"]++
		return
	}
	g, err := decodeGroup(raw, t, &w.Stats)
	if err != nil {
		w.Stats.DecodeFailures["guilds"]++
		return
	}
	w.Guilds = append(w.Guilds, g)
}

func baseFromEntry(e mapEntry, stats *ParseStats) BaseCamp {
	b := BaseCamp{}
	if id, ok := e.Key.(string); ok {
		b.ID = id
	}
	if v, ok := asProperties(e.Value); ok {
		b.GuildID = firstString(v, "GroupIdBelongTo", "GroupID", "GuildId", "GuildID")
		// The base's name and world transform live inside PalBaseCampSaveData.RawData;
		// neither is exposed as an ordinary property, so decode them from the raw
		// bytes. A pre-1.0 save that instead carries a plain vector property is
		// still honored as a fallback.
		if raw, ok := propertyBytes(v, "RawData"); ok {
			name, loc, areaRange, rawGuildID, ok := decodeBaseRaw(raw, b.ID)
			if ok {
				b.Name = normalizeBaseName(name)
			}
			if loc != nil {
				b.Position = loc
			} else {
				stats.recordSkip("worldSaveData.BaseCampSaveData.Value.RawData.transform", "tolerated")
			}
			if areaRange > 0 {
				b.AreaRange = areaRange
			}
			if rawGuildID != "" {
				if b.GuildID == "" {
					b.GuildID = rawGuildID
				} else if !strings.EqualFold(b.GuildID, rawGuildID) {
					b.AreaRange = 0
					stats.recordSkip("worldSaveData.BaseCampSaveData.Value.RawData.group_id_belong_to", "conflict")
				}
			}
		}
		if b.Position == nil {
			if p, ok := firstVector(v, "Position", "Location"); ok {
				b.Position = &p
			}
		}
		if worker, ok := propertyProperties(v, "WorkerDirector"); ok {
			if raw, ok := propertyBytes(worker, "RawData"); ok {
				b.WorkerContainerID = workerContainerID(raw, b.ID)
			}
		}
	}
	return b
}

// decodeBaseRaw decodes the name, world-space translation, area range and guild
// identity of a base camp
// from PalBaseCampSaveData.RawData. The proven retail 1.x prefix is:
//
//	id                 GUID (16 bytes) — must match the map key
//	name               fstring (UTF-16 in retail saves)
//	state              1 byte (EPalBaseCampWorkerStateType)
//	transform          FTransform: rotation quaternion (4 f64) + translation
//	                   (3 f64) + scale3d (3 f64); modern 1.x saves store each
//	                   component as f64
//	area_range         f32
//	group_id_belong_to GUID
//	... (worker/module data this decoder ignores)
//
// ok reports whether the structural prefix (GUID + name) decoded; the raw name
// is returned as stored (normalizeBaseName decides what is displayable). The
// location is nil — served as null, never a misleading (0,0) — on any
// structural drift past the name: a short buffer, a read error, or a
// non-finite/implausibly large component. A GUID that does not match the map
// key fails the whole decode. Verified against a live 1.0 world: all 20 bases
// decoded to within <1 cm of the guild's in-game PalBox.
func decodeBaseRaw(raw []byte, baseID string) (
	name string,
	loc *Vector,
	areaRange float64,
	guildID string,
	ok bool,
) {
	r := newReader(raw)
	embedded, err := readGUID(r)
	if err != nil || (baseID != "" && !strings.EqualFold(embedded, baseID)) {
		return "", nil, 0, "", false
	}
	if name, err = r.fstring(); err != nil {
		return "", nil, 0, "", false
	}
	// state byte, then the rotation quaternion (4 f64) we do not need.
	if err = r.skip(1 + 4*8); err != nil {
		return name, nil, 0, "", true
	}
	x, err := r.f64()
	if err != nil {
		return name, nil, 0, "", true
	}
	y, err := r.f64()
	if err != nil {
		return name, nil, 0, "", true
	}
	z, err := r.f64()
	if err != nil {
		return name, nil, 0, "", true
	}
	if !finiteBaseCoord(x) || !finiteBaseCoord(y) || !finiteBaseCoord(z) {
		return name, nil, 0, "", true
	}
	loc = &Vector{X: x, Y: y, Z: z}
	if err = r.skip(3 * 8); err != nil {
		return name, loc, 0, "", true
	}
	rawAreaRange, err := r.f32()
	if err != nil || !finiteBaseRange(float64(rawAreaRange)) {
		return name, loc, 0, "", true
	}
	decodedGuildID, err := readGUID(r)
	if err != nil {
		return name, loc, 0, "", true
	}
	return name, loc, float64(rawAreaRange), decodedGuildID, true
}

// baseNamePlaceholderPrefix is the engine-side default written into every base
// camp the player never renamed: "新規生成拠点テンプレート名<n>(仮)" — literally
// "newly generated base template name <n> (tentative)". Palworld writes this
// placeholder regardless of the server's locale (the in-game UI substitutes a
// localized label), so it is not a player-chosen name and must not be shown.
const baseNamePlaceholderPrefix = "新規生成拠点テンプレート名"

// normalizeBaseName maps a raw stored base name to its displayable form: empty
// when the base is effectively unnamed. Whitespace-only names and the engine's
// untranslated placeholder template collapse to "" so every downstream surface
// can apply one rule — empty means absent means null, never a synthetic value.
func normalizeBaseName(name string) string {
	name = strings.TrimSpace(name)
	if strings.HasPrefix(name, baseNamePlaceholderPrefix) {
		return ""
	}
	return name
}

// finiteBaseCoord rejects NaN, infinities, and coordinates far outside any
// plausible Palworld world extent (~±700 km in cm), which would indicate the
// transform read landed on misaligned bytes rather than a real translation.
func finiteBaseCoord(v float64) bool {
	const maxWorldCoord = 1e10
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= -maxWorldCoord && v <= maxWorldCoord
}

func finiteBaseRange(v float64) bool {
	const maxBaseRange = 1e7
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v > 0 && v <= maxBaseRange
}

// workerContainerID decodes PalBaseCampSaveData_WorkerDirector.RawData. The
// stable prefix is [base GUID][FTransform: 10 float64][order byte][battle byte]
// [worker-container GUID]. Palworld 1.0 appends four version bytes, so trailing
// data is tolerated while every structural field before the container remains
// fixed-width and the embedded base GUID must match the map key.
func workerContainerID(raw []byte, baseID string) string {
	const containerOffset = 16 + (10 * 8) + 2
	if len(raw) < containerOffset+16 {
		return ""
	}
	reader := newReader(raw)
	embeddedBase, err := readGUID(reader)
	if err != nil || (baseID != "" && !strings.EqualFold(embeddedBase, baseID)) {
		return ""
	}
	if err = reader.skip((10 * 8) + 2); err != nil {
		return ""
	}
	containerID, err := readGUID(reader)
	if err != nil {
		return ""
	}
	return containerID
}

func propertyBytes(p propertyMap, name string) ([]byte, bool) {
	q := p[name]
	if q == nil {
		return nil, false
	}
	value, ok := q.Value.([]byte)
	return value, ok
}

func assignBaseWorkers(w *World) {
	byContainer := make(map[string]string, len(w.Bases))
	for _, base := range w.Bases {
		if base.WorkerContainerID != "" {
			byContainer[strings.ToLower(base.WorkerContainerID)] = base.ID
		}
	}
	for i := range w.Pals {
		w.Pals[i].BaseID = byContainer[strings.ToLower(w.Pals[i].ContainerID)]
	}
}

// assignBaseGuilds joins the decoded guild BaseIDs to BaseCampSaveData keys.
// Palworld 1.0 does not expose GroupIdBelongTo as an ordinary property on every
// base entry, while the guild's exact base-id array is structural and proven.
func assignBaseGuilds(w *World) {
	owners := make(map[string]string, len(w.Bases))
	ambiguous := make(map[string]bool)
	for _, guild := range w.Guilds {
		for _, rawBaseID := range guild.BaseIDs {
			baseID := strings.ToLower(rawBaseID)
			if current, exists := owners[baseID]; exists && !strings.EqualFold(current, guild.ID) {
				ambiguous[baseID] = true
				continue
			}
			owners[baseID] = guild.ID
		}
	}
	for i := range w.Bases {
		key := strings.ToLower(w.Bases[i].ID)
		owner := owners[key]
		if ambiguous[key] || (owner != "" && w.Bases[i].GuildID != "" && !strings.EqualFold(owner, w.Bases[i].GuildID)) {
			w.Bases[i].GuildID = ""
			w.Bases[i].AreaRange = 0
			continue
		}
		if w.Bases[i].GuildID == "" {
			w.Bases[i].GuildID = owner
		}
	}
}

func metaFromProperties(p propertyMap) WorldMeta {
	m := WorldMeta{
		WorldUID:  firstStringRecursive(p, "WorldUID", "WorldUid", "WorldGuid", "WorldGUID"),
		WorldName: firstStringRecursive(p, "WorldName", "world_name", "Name"),
	}
	m.Day = firstIntRecursive(p, "Day", "GameDay", "InGameDay")
	m.Timestamp = firstIntRecursive(p, "Timestamp")
	if q := p["Timestamp"]; q != nil {
		if s, ok := q.Value.(structData); ok {
			if v, ok := s.Value.(uint64); ok {
				m.Timestamp = int64(v)
			}
		}
	}
	m.Version = firstIntRecursive(p, "Version")
	return m
}

func loadPlayerDirectory(w *World, levelPath string, opts Options) error {
	dir := opts.PlayersDir
	if dir == "" {
		dir = filepath.Join(filepath.Dir(levelPath), "Players")
	}
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("sav: read declared Players directory")
	}
	for _, de := range entries {
		if de.IsDir() {
			continue
		}
		uid, ok := playerUIDFromSaveFilename(de.Name())
		if !ok {
			storageOwnerUID, dimensional := dimensionalStorageOwnerUIDFromFilename(de.Name())
			if !dimensional {
				continue
			}
			raw, e := readSave(filepath.Join(dir, de.Name()))
			if e != nil {
				return fmt.Errorf("sav: decode declared dimensional-storage file")
			}
			g, e := parsePlayerGVAS(raw, &w.Stats)
			if e != nil {
				return fmt.Errorf("sav: parse declared dimensional-storage GVAS")
			}
			pals, e := dimensionalPalsFromProperties(g.Properties, storageOwnerUID)
			if e != nil {
				return fmt.Errorf("sav: decode declared dimensional-storage inventory")
			}
			w.Pals = append(w.Pals, pals...)
			continue
		}
		raw, e := readSave(filepath.Join(dir, de.Name()))
		if e != nil {
			return fmt.Errorf("sav: decode declared player file")
		}
		g, e := parsePlayerGVAS(raw, &w.Stats)
		if e != nil {
			return fmt.Errorf("sav: parse declared player GVAS")
		}
		data := g.Properties
		if nested, ok := propertyProperties(data, "SaveData"); ok {
			data = nested
		}
		p := Player{
			UID:      uid,
			WorldUID: firstStringRecursive(data, "WorldUID", "WorldUid", "WorldGuid", "WorldGUID"),
			Nickname: firstStringRecursive(data, "NickName", "Nickname"),
			Level:    int32(firstIntRecursive(data, "Level")),
		}
		decodePlayerProgress(data, &p)
		if loc, ok := firstVectorRecursive(data, "Location", "Position"); ok {
			p.Location = &loc
		}
		// Party and pal-box container GUIDs live at the SaveData top level as
		// PalContainerId structs wrapping a Guid "ID". Absent ids leave the
		// fields empty, matching how the rest of this loader degrades.
		p.OtomoContainerID = containerGUID(data, "OtomoCharacterContainerId")
		p.PalStorageContainerID = containerGUID(data, "PalStorageContainerId")
		p.ItemContainerIDs = playerItemContainerIDs(data)
		mergePlayer(w, p)
	}
	return nil
}

func playerUIDFromSaveFilename(name string) (string, bool) {
	extension := filepath.Ext(name)
	if !strings.EqualFold(extension, ".sav") {
		return "", false
	}
	compact := strings.TrimSuffix(name, extension)
	return playerUIDFromCompactHex(compact)
}

func playerUIDFromCompactHex(compact string) (string, bool) {
	if len(compact) != 32 {
		return "", false
	}
	if _, err := hex.DecodeString(compact); err != nil {
		return "", false
	}
	compact = strings.ToLower(compact)
	return fmt.Sprintf(
		"%s-%s-%s-%s-%s",
		compact[:8], compact[8:12], compact[12:16], compact[16:20], compact[20:],
	), true
}

func parsePlayerGVAS(raw []byte, aggregate *ParseStats) (*gvasFile, error) {
	stats := newStats()
	parsed, err := parseGVAS(raw, &stats)
	if err != nil {
		return nil, err
	}
	aggregate.mergeDiagnostics(stats)
	return parsed, nil
}

func mergePlayer(w *World, p Player) {
	for i := range w.Players {
		if guidIdentityKey(w.Players[i].UID) == guidIdentityKey(p.UID) {
			if p.WorldUID != "" {
				w.Players[i].WorldUID = p.WorldUID
			}
			if p.Nickname != "" {
				w.Players[i].Nickname = p.Nickname
			}
			if p.Level != 0 {
				w.Players[i].Level = p.Level
			}
			if p.Location != nil {
				w.Players[i].Location = p.Location
			}
			if p.OtomoContainerID != "" {
				w.Players[i].OtomoContainerID = p.OtomoContainerID
			}
			if p.PalStorageContainerID != "" {
				w.Players[i].PalStorageContainerID = p.PalStorageContainerID
			}
			if len(p.ItemContainerIDs) > 0 {
				w.Players[i].ItemContainerIDs = append([]string(nil), p.ItemContainerIDs...)
			}
			if p.CaptureTotal != nil {
				w.Players[i].CaptureTotal = p.CaptureTotal
			}
			if p.UniquePalsCaptured != nil {
				w.Players[i].UniquePalsCaptured = p.UniquePalsCaptured
			}
			if p.PaldeckUnlocked != nil {
				w.Players[i].PaldeckUnlocked = p.PaldeckUnlocked
			}
			if p.PalCaptureCounts != nil {
				w.Players[i].PalCaptureCounts = p.PalCaptureCounts
				w.Players[i].PalCaptureCountsTruncated = p.PalCaptureCountsTruncated
			}
			if p.PaldeckUnlockFlags != nil {
				w.Players[i].PaldeckUnlockFlags = p.PaldeckUnlockFlags
				w.Players[i].PaldeckUnlockFlagsTruncated = p.PaldeckUnlockFlagsTruncated
			}
			return
		}
	}
	w.Players = append(w.Players, p)
}

func playerItemContainerIDs(data propertyMap) []string {
	inventory, ok := propertyProperties(data, "InventoryInfo")
	if !ok {
		return nil
	}
	names := []string{
		"CommonContainerId",
		"DropSlotContainerId",
		"EssentialContainerId",
		"WeaponLoadOutContainerId",
		"PlayerEquipArmorContainerId",
		"FoodEquipContainerId",
	}
	seen := make(map[string]struct{}, len(names))
	result := make([]string, 0, len(names))
	for _, name := range names {
		containerID := strings.TrimSpace(containerGUID(inventory, name))
		key := guidIdentityKey(containerID)
		if containerID == "" || zeroGUID(containerID) {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, containerID)
	}
	return result
}

func excludePlayerItemContainers(w *World) {
	excluded := make(map[string]struct{})
	for _, player := range w.Players {
		for _, containerID := range player.ItemContainerIDs {
			excluded[guidIdentityKey(containerID)] = struct{}{}
		}
	}
	if len(excluded) == 0 {
		return
	}
	filtered := w.ItemStacks[:0]
	for _, stack := range w.ItemStacks {
		if _, personal := excluded[guidIdentityKey(stack.ContainerID)]; !personal {
			filtered = append(filtered, stack)
		}
	}
	w.ItemStacks = filtered
}

func guidIdentityKey(value string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), "-", ""))
}

// decodePlayerProgress reads only documented, typed fields from the per-player
// SaveData.RecordData struct. It deliberately does not estimate lifetime catches
// from the current world roster. Missing maps stay nil so API consumers can say
// "unavailable" instead of presenting a misleading zero.
func decodePlayerProgress(data propertyMap, p *Player) {
	const maxPaldeckEntries = 2048
	record, ok := propertyProperties(data, "RecordData")
	if !ok {
		return
	}
	if v, ok := propertyInt(record, "TribeCaptureCount"); ok && v >= 0 {
		p.CaptureTotal = int64Ptr(v)
	}
	if entries, ok := propertyMapEntries(record, "PalCaptureCount"); ok {
		count := 0
		p.PalCaptureCounts = make(map[string]int64, min(len(entries), maxPaldeckEntries))
		for _, entry := range entries {
			if v, ok := numericValue(entry.Value); ok && v > 0 {
				count++
			}
			key, validKey := entry.Key.(string)
			value, validValue := numericValue(entry.Value)
			key = strings.TrimSpace(key)
			if !validKey || key == "" || !validValue || value < 0 {
				continue
			}
			if _, exists := p.PalCaptureCounts[key]; !exists && len(p.PalCaptureCounts) == maxPaldeckEntries {
				p.PalCaptureCountsTruncated = true
				continue
			}
			p.PalCaptureCounts[key] = value
		}
		p.UniquePalsCaptured = intPtr(count)
	}
	if entries, ok := propertyMapEntries(record, "PaldeckUnlockFlag"); ok {
		count := 0
		p.PaldeckUnlockFlags = make(map[string]bool, min(len(entries), maxPaldeckEntries))
		for _, entry := range entries {
			if v, ok := entry.Value.(bool); ok && v {
				count++
			}
			key, validKey := entry.Key.(string)
			value, validValue := entry.Value.(bool)
			key = strings.TrimSpace(key)
			if !validKey || key == "" || !validValue {
				continue
			}
			if _, exists := p.PaldeckUnlockFlags[key]; !exists && len(p.PaldeckUnlockFlags) == maxPaldeckEntries {
				p.PaldeckUnlockFlagsTruncated = true
				continue
			}
			p.PaldeckUnlockFlags[key] = value
		}
		p.PaldeckUnlocked = intPtr(count)
	}
}

func propertyMapEntries(p propertyMap, name string) ([]mapEntry, bool) {
	q := p[name]
	if q == nil {
		return nil, false
	}
	v, ok := q.Value.([]mapEntry)
	return v, ok
}

func numericValue(v any) (int64, bool) {
	switch n := v.(type) {
	case int32:
		return int64(n), true
	case int64:
		return n, true
	case uint32:
		return int64(n), true
	case uint64:
		if n <= uint64(^uint64(0)>>1) {
			return int64(n), true
		}
	}
	return 0, false
}

func intPtr(v int) *int       { return &v }
func int64Ptr(v int64) *int64 { return &v }

func asProperties(v any) (propertyMap, bool) {
	switch x := v.(type) {
	case propertyMap:
		return x, true
	case structData:
		p, ok := x.Value.(propertyMap)
		return p, ok
	default:
		return nil, false
	}
}
func propertyProperties(p propertyMap, name string) (propertyMap, bool) {
	q := p[name]
	if q == nil {
		return nil, false
	}
	return asProperties(q.Value)
}
func propertyInt(p propertyMap, name string) (int64, bool) {
	q := p[name]
	if q == nil {
		return 0, false
	}
	switch v := q.Value.(type) {
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case uint16:
		return int64(v), true
	case uint32:
		return int64(v), true
	case uint64:
		return int64(v), true
	case enumData:
		// Palworld 1.0 serializes small integers such as pal Level and the
		// Talent_* stats as a ByteProperty, which decodes to enumData{Type:"None"}
		// carrying the numeric byte as a string. A named enum (e.g. Gender) is not
		// numeric and simply fails the parse, yielding (0,false).
		if n, err := strconv.ParseInt(v.Value, 10, 64); err == nil {
			return n, true
		}
	}
	return 0, false
}
func firstInt(p propertyMap, names ...string) int64 {
	for _, n := range names {
		if v, ok := propertyInt(p, n); ok {
			return v
		}
	}
	return 0
}
func firstNumber(p propertyMap, names ...string) float64 {
	for _, n := range names {
		q := p[n]
		if q == nil {
			continue
		}
		switch v := q.Value.(type) {
		case int32:
			return float64(v)
		case int64:
			return float64(v)
		case uint32:
			return float64(v)
		case uint64:
			return float64(v)
		case float32:
			return float64(v)
		case float64:
			return v
		case structData:
			if nested, ok := v.Value.(propertyMap); ok {
				return firstNumber(nested, "Value", "Current", "HP")
			}
		}
	}
	return 0
}
func firstBool(p propertyMap, names ...string) bool {
	for _, n := range names {
		if q := p[n]; q != nil {
			if v, ok := q.Value.(bool); ok {
				return v
			}
		}
	}
	return false
}
func firstString(p propertyMap, names ...string) string {
	for _, n := range names {
		if q := p[n]; q != nil {
			switch v := q.Value.(type) {
			case string:
				return v
			case enumData:
				return v.Value
			case structData:
				if s, ok := v.Value.(string); ok {
					return s
				}
			}
		}
	}
	return ""
}

func propertyStringArray(p propertyMap, name string) []string {
	q := p[name]
	if q == nil {
		return nil
	}
	values, ok := q.Value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		switch typed := value.(type) {
		case string:
			if typed != "" {
				out = append(out, typed)
			}
		case enumData:
			if typed.Value != "" {
				out = append(out, typed.Value)
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
func firstGUID(p propertyMap, names ...string) string { return firstString(p, names...) }

// containerGUID reads a PalContainerId-shaped property: a StructProperty wrapping
// a Guid-typed "ID". Both a pal's SlotId.ContainerId and a player's party/box
// container ids use this shape. Returns the normalized GUID, or "" when the named
// property is absent or not a struct.
func containerGUID(p propertyMap, name string) string {
	inner, ok := propertyProperties(p, name)
	if !ok {
		return ""
	}
	return firstString(inner, "ID")
}
func firstVector(p propertyMap, names ...string) (Vector, bool) {
	for _, n := range names {
		if q := p[n]; q != nil {
			if s, ok := q.Value.(structData); ok {
				if v, ok := s.Value.(Vector); ok {
					return v, true
				}
			}
		}
	}
	return Vector{}, false
}

func firstStringRecursive(p propertyMap, names ...string) string {
	if v := firstString(p, names...); v != "" {
		return v
	}
	for _, q := range p {
		if n, ok := asProperties(q.Value); ok {
			if v := firstStringRecursive(n, names...); v != "" {
				return v
			}
		}
	}
	return ""
}
func firstIntRecursive(p propertyMap, names ...string) int64 {
	if v := firstInt(p, names...); v != 0 {
		return v
	}
	for _, q := range p {
		if n, ok := asProperties(q.Value); ok {
			if v := firstIntRecursive(n, names...); v != 0 {
				return v
			}
		}
	}
	return 0
}
func firstVectorRecursive(p propertyMap, names ...string) (Vector, bool) {
	if v, ok := firstVector(p, names...); ok {
		return v, true
	}
	for _, q := range p {
		if n, ok := asProperties(q.Value); ok {
			if v, ok := firstVectorRecursive(n, names...); ok {
				return v, true
			}
		}
	}
	return Vector{}, false
}
