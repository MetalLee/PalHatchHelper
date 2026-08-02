package canonical

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/MetalLee/PalHatchHelper/parser/internal/sav"
	"golang.org/x/text/unicode/norm"
)

const StableIDSpecification = "palworld-stable-id-v1"

var stableIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)

type Snapshot struct {
	Server              Server      `json:"server"`
	Guilds              []Guild     `json:"guilds"`
	Players             []Player    `json:"players"`
	Pals                []Pal       `json:"pals"`
	Bases               []Base      `json:"bases"`
	ItemStacks          []ItemStack `json:"item_stacks"`
	ItemInventoryStatus string      `json:"item_inventory_status"`
}

type Server struct {
	WorldUID    string  `json:"world_uid"`
	SaveVersion *string `json:"save_version"`
	CapturedAt  string  `json:"captured_at"`
}

type Guild struct {
	GuildUID string `json:"guild_uid"`
	Name     string `json:"name"`
}

type Player struct {
	PlayerUID string  `json:"player_uid"`
	Nickname  string  `json:"nickname"`
	Level     *int    `json:"level"`
	GuildUID  *string `json:"guild_uid"`
}

type Base struct {
	BaseID   string  `json:"base_id"`
	GuildUID *string `json:"guild_uid"`
	Name     *string `json:"name"`
}

type ItemStack struct {
	ContainerID      string  `json:"container_id"`
	ItemID           string  `json:"item_id"`
	Quantity         int     `json:"quantity"`
	ContainerType    string  `json:"container_type"`
	BaseID           *string `json:"base_id"`
	GuildUID         *string `json:"guild_uid"`
	SlotIndex        int     `json:"slot_index"`
	ResolutionStatus string  `json:"resolution_status"`
}

type SourceMetadata struct {
	SourceInternalName              string   `json:"source_internal_name"`
	SourcePassiveSkillInternalNames []string `json:"source_passive_skill_internal_names"`
}

type Pal struct {
	InstanceUID         string         `json:"instance_uid"`
	OwnerPlayerUID      *string        `json:"owner_player_uid"`
	GuildUID            *string        `json:"guild_uid"`
	PalID               string         `json:"pal_id"`
	IsBoss              bool           `json:"is_boss"`
	Gender              string         `json:"gender"`
	Level               *int           `json:"level"`
	PassiveSkillIDs     []string       `json:"passive_skill_ids"`
	LocationType        string         `json:"location_type"`
	LocationName        *string        `json:"location_name"`
	LocationID          *string        `json:"location_id"`
	LocationSlotIndex   *int           `json:"location_slot_index"`
	LocationAccessScope string         `json:"location_access_scope"`
	Metadata            SourceMetadata `json:"metadata"`
}

type Warning struct {
	Code  string
	Count int
}

type warningSet map[string]int

func (w warningSet) add(code string) { w[code]++ }

// NormalizeStableID applies the shared palworld-stable-id-v1 mapping. It never
// slugs or invents an identifier for invalid input.
func NormalizeStableID(source string) (string, error) {
	normalized := strings.ToLower(norm.NFKC.String(source))
	if len(normalized) == 0 || len(normalized) > 120 || !stableIDPattern.MatchString(normalized) {
		return "", fmt.Errorf("GAME_ID_INVALID")
	}
	return normalized, nil
}

func NormalizeInventoryPalID(source string) (string, error) {
	stableID, err := NormalizeStableID(source)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(stableID, "boss_") && len(stableID) > len("boss_") {
		stableID = stableID[len("boss_"):]
		if strings.HasSuffix(stableID, "_otomo") && len(stableID) > len("_otomo") {
			stableID = stableID[:len(stableID)-len("_otomo")]
		}
	}
	return stableID, nil
}

func Build(
	world *sav.World,
	worldUID string,
	format sav.ContainerFormat,
	captured time.Time,
) (Snapshot, []Warning, error) {
	warnings := warningSet{}
	version := fmt.Sprintf("%s/0x%02x", format.Magic, format.SaveType)
	result := Snapshot{
		Server: Server{WorldUID: worldUID, SaveVersion: &version, CapturedAt: captured.UTC().Format(time.RFC3339Nano)},
		Guilds: []Guild{}, Players: []Player{}, Pals: []Pal{}, Bases: []Base{}, ItemStacks: []ItemStack{},
		ItemInventoryStatus: normalizedItemInventoryStatus(world.ItemInventoryStatus),
	}

	guildNames := make(map[string]string, len(world.Guilds))
	for _, source := range world.Guilds {
		uid := strings.TrimSpace(source.ID)
		if uid == "" {
			warnings.add("GUILD_UID_UNKNOWN")
			continue
		}
		name := strings.TrimSpace(source.Name)
		if name == "" {
			name = "Unknown guild"
			warnings.add("GUILD_NAME_UNKNOWN")
		}
		if previous, exists := guildNames[uid]; exists {
			if previous != name {
				warnings.add("GUILD_UID_CONFLICT")
			}
			continue
		}
		guildNames[uid] = name
		result.Guilds = append(result.Guilds, Guild{GuildUID: uid, Name: name})
	}

	players := make(map[string]sav.Player, len(world.Players))
	for _, source := range world.Players {
		uid := strings.TrimSpace(source.UID)
		if uid == "" {
			warnings.add("PLAYER_UID_UNKNOWN")
			continue
		}
		players[strings.ToLower(uid)] = source
		name := strings.TrimSpace(source.Nickname)
		if name == "" {
			name = "Unknown player"
			warnings.add("PLAYER_NICKNAME_UNKNOWN")
		}
		result.Players = append(result.Players, Player{
			PlayerUID: uid,
			Nickname:  name,
			Level:     boundedLevel(source.Level, warnings),
			GuildUID:  optionalString(source.GuildID),
		})
	}

	bases := make(map[string]sav.BaseCamp, len(world.Bases))
	for _, base := range world.Bases {
		bases[strings.ToLower(base.ID)] = base
		if strings.TrimSpace(base.ID) == "" {
			warnings.add("BASE_ID_UNKNOWN")
			continue
		}
		result.Bases = append(result.Bases, Base{
			BaseID:   base.ID,
			GuildUID: optionalString(base.GuildID),
			Name:     optionalString(base.Name),
		})
	}
	palIDs := newStableIDMap()
	passiveIDs := newStableIDMap()
	for index, source := range world.Pals {
		instanceUID := strings.TrimSpace(source.InstanceID)
		if instanceUID == "" {
			instanceUID = fmt.Sprintf("unresolved-instance-%06d", index+1)
			warnings.add("PAL_INSTANCE_UID_UNKNOWN")
		}
		sourcePalID := strings.TrimSpace(source.CharacterID)
		isBoss := source.IsBoss || strings.HasPrefix(strings.ToLower(sourcePalID), "boss_")
		palID, err := palIDs.mapID(sourcePalID, source.InDimensionalStorage)
		if err != nil {
			if err.Error() == "GAME_ID_NORMALIZATION_COLLISION" {
				return Snapshot{}, nil, err
			}
			palID, sourcePalID = "unknown", "unknown"
			warnings.add("PAL_ID_UNKNOWN")
		} else {
			palID, err = NormalizeInventoryPalID(palID)
			if err != nil {
				palID, sourcePalID = "unknown", "unknown"
				warnings.add("PAL_ID_UNKNOWN")
			}
		}
		sourcePassives := uniqueStrings(source.PassiveSkillIDs)
		passives := make([]string, 0, len(sourcePassives))
		metadataPassives := make([]string, 0, len(sourcePassives))
		for _, raw := range sourcePassives {
			mapped, mapErr := passiveIDs.mapID(raw, false)
			if mapErr != nil {
				if mapErr.Error() == "GAME_ID_NORMALIZATION_COLLISION" {
					return Snapshot{}, nil, mapErr
				}
				warnings.add("PASSIVE_SKILL_ID_UNKNOWN")
				continue
			}
			passives = append(passives, mapped)
			metadataPassives = append(metadataPassives, raw)
		}
		passives = uniqueStrings(passives)
		owner := optionalString(source.OwnerUID)
		guild := (*string)(nil)
		locationType := "unknown"
		locationName := (*string)(nil)
		locationID := (*string)(nil)
		locationSlotIndex := (*int)(nil)
		locationAccessScope := "unresolved"
		if source.InDimensionalStorage {
			locationType = "dimensional_storage"
			locationSlotIndex = optionalNonnegativeInt(source.SlotIndex)
			locationAccessScope = normalizedAccessScope(source.LocationAccessScope)
			if storageOwnerUID := optionalString(source.StorageOwnerUID); storageOwnerUID != nil {
				locationID = optionalString("dimensional-storage:" + strings.ToLower(*storageOwnerUID))
				if player, ok := players[strings.ToLower(*storageOwnerUID)]; ok {
					locationName = optionalString(player.Nickname)
					guild = optionalString(player.GuildID)
				}
			}
			if owner != nil {
				if player, ok := players[strings.ToLower(*owner)]; ok {
					guild = optionalString(player.GuildID)
				}
			}
		} else if base, ok := bases[strings.ToLower(source.BaseID)]; ok && source.BaseID != "" {
			guild = optionalString(base.GuildID)
			locationType = "base"
			locationName = optionalString(base.Name)
			locationID = optionalString(base.ID)
			locationSlotIndex = optionalNonnegativeInt(source.SlotIndex)
			locationAccessScope = "guild"
		} else if owner != nil {
			if player, ok := players[strings.ToLower(*owner)]; ok {
				guild = optionalString(player.GuildID)
				switch {
				case source.ContainerID != "" && strings.EqualFold(source.ContainerID, player.OtomoContainerID):
					locationType = "player_party"
					locationName = optionalString(player.Nickname)
					locationSlotIndex = optionalNonnegativeInt(source.SlotIndex)
					locationAccessScope = "player"
				case source.ContainerID != "" && strings.EqualFold(source.ContainerID, player.PalStorageContainerID):
					locationType = "player_storage"
					locationName = optionalString(player.Nickname)
					locationSlotIndex = optionalNonnegativeInt(source.SlotIndex)
					locationAccessScope = "player"
				}
			}
		}
		gender := source.Gender
		if gender != "male" && gender != "female" && gender != "genderless" {
			gender = "unknown"
			warnings.add("PAL_GENDER_UNKNOWN")
		}
		result.Pals = append(result.Pals, Pal{
			InstanceUID: instanceUID, OwnerPlayerUID: owner, GuildUID: guild,
			PalID: palID, IsBoss: isBoss, Gender: gender, Level: boundedLevel(source.Level, warnings),
			PassiveSkillIDs: passives, LocationType: locationType, LocationName: locationName,
			LocationID: locationID, LocationSlotIndex: locationSlotIndex,
			LocationAccessScope: locationAccessScope,
			Metadata:            SourceMetadata{SourceInternalName: sourcePalID, SourcePassiveSkillInternalNames: metadataPassives},
		})
	}

	itemIDs := newStableIDMap()
	stackKeys := make(map[string]sav.ItemStack, len(world.ItemStacks))
	for _, source := range world.ItemStacks {
		if source.Quantity <= 0 || source.SlotIndex < 0 {
			warnings.add("ITEM_STACK_VALUE_INVALID")
			continue
		}
		containerID := strings.TrimSpace(source.ContainerID)
		if containerID == "" {
			warnings.add("ITEM_CONTAINER_ID_UNKNOWN")
			continue
		}
		key := strings.ToLower(containerID) + ":" + fmt.Sprint(source.SlotIndex)
		if previous, exists := stackKeys[key]; exists {
			if previous != source {
				return Snapshot{}, nil, fmt.Errorf("ITEM_STACK_CONFLICT")
			}
			continue
		}
		stackKeys[key] = source
		itemID, err := itemIDs.mapID(strings.TrimSpace(source.ItemID), false)
		if err != nil {
			if err.Error() == "GAME_ID_NORMALIZATION_COLLISION" {
				return Snapshot{}, nil, err
			}
			itemID = "unknown"
			warnings.add("ITEM_ID_UNKNOWN")
		}
		baseID := optionalString(source.BaseID)
		guildUID := (*string)(nil)
		resolution := "unresolved"
		containerType := normalizedContainerType(source.ContainerType)
		if containerType == "unknown" {
			resolution = "unsupported"
		}
		if baseID != nil {
			if base, ok := bases[strings.ToLower(*baseID)]; ok {
				guildUID = optionalString(base.GuildID)
				if guildUID != nil && containerType != "unknown" && itemID != "unknown" {
					resolution = "resolved"
				}
			}
		} else if containerType == "guild_chest" {
			guildID := strings.TrimSpace(source.GuildID)
			if _, ok := guildNames[guildID]; ok {
				guildUID = optionalString(guildID)
				if itemID != "unknown" {
					resolution = "resolved"
				}
			}
		}
		result.ItemStacks = append(result.ItemStacks, ItemStack{
			ContainerID: containerID, ItemID: itemID, Quantity: source.Quantity,
			ContainerType: containerType, BaseID: baseID, GuildUID: guildUID,
			SlotIndex: source.SlotIndex, ResolutionStatus: resolution,
		})
	}

	sort.Slice(result.Guilds, func(i, j int) bool { return result.Guilds[i].GuildUID < result.Guilds[j].GuildUID })
	sort.Slice(result.Players, func(i, j int) bool { return result.Players[i].PlayerUID < result.Players[j].PlayerUID })
	sort.Slice(result.Pals, func(i, j int) bool { return result.Pals[i].InstanceUID < result.Pals[j].InstanceUID })
	sort.Slice(result.Bases, func(i, j int) bool { return result.Bases[i].BaseID < result.Bases[j].BaseID })
	sort.Slice(result.ItemStacks, func(i, j int) bool {
		if result.ItemStacks[i].ContainerID == result.ItemStacks[j].ContainerID {
			return result.ItemStacks[i].SlotIndex < result.ItemStacks[j].SlotIndex
		}
		return result.ItemStacks[i].ContainerID < result.ItemStacks[j].ContainerID
	})
	return result, sortedWarnings(warnings), nil
}

func normalizedContainerType(value string) string {
	switch value {
	case "storage_box", "refrigerator", "feed_box", "production_output", "guild_chest":
		return value
	default:
		return "unknown"
	}
}

func normalizedItemInventoryStatus(value string) string {
	switch value {
	case "available", "partial":
		return value
	default:
		return "unavailable"
	}
}

type stableIDSource struct {
	value                 string
	allowASCIICaseVariant bool
}

type stableIDMap struct{ sourceByID map[string]stableIDSource }

func newStableIDMap() *stableIDMap {
	return &stableIDMap{sourceByID: map[string]stableIDSource{}}
}

func (m *stableIDMap) mapID(source string, allowASCIICaseVariant bool) (string, error) {
	stable, err := NormalizeStableID(source)
	if err != nil {
		return "", err
	}
	if previous, exists := m.sourceByID[stable]; exists && previous.value != source {
		if (allowASCIICaseVariant || previous.allowASCIICaseVariant) &&
			equalASCIICaseVariant(previous.value, source) {
			return stable, nil
		}
		return "", fmt.Errorf("GAME_ID_NORMALIZATION_COLLISION")
	}
	m.sourceByID[stable] = stableIDSource{
		value: source, allowASCIICaseVariant: allowASCIICaseVariant,
	}
	return stable, nil
}

func equalASCIICaseVariant(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range len(left) {
		leftByte := left[index]
		rightByte := right[index]
		if leftByte == rightByte {
			continue
		}
		if leftByte >= 'A' && leftByte <= 'Z' {
			leftByte += 'a' - 'A'
		}
		if rightByte >= 'A' && rightByte <= 'Z' {
			rightByte += 'a' - 'A'
		}
		if leftByte != rightByte || leftByte > 0x7f {
			return false
		}
	}
	return true
}

func boundedLevel(value int32, warnings warningSet) *int {
	if value < 1 || value > 100 {
		if value != 0 {
			warnings.add("LEVEL_OUT_OF_RANGE")
		}
		return nil
	}
	result := int(value)
	return &result
}

func optionalString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func optionalNonnegativeInt(value int) *int {
	if value < 0 {
		return nil
	}
	return &value
}

func normalizedAccessScope(value string) string {
	switch value {
	case "player", "guild":
		return value
	default:
		return "unresolved"
	}
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func sortedWarnings(values warningSet) []Warning {
	result := make([]Warning, 0, len(values))
	for code, count := range values {
		result = append(result, Warning{Code: code, Count: count})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Code < result[j].Code })
	return result
}
