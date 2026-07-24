package sav

import (
	"fmt"
	"path/filepath"
	"strings"
)

const dimensionalStorageFilenameSuffix = "_dps"

func dimensionalStorageOwnerUIDFromFilename(name string) (string, bool) {
	extension := filepath.Ext(name)
	if !strings.EqualFold(extension, ".sav") {
		return "", false
	}
	stem := strings.TrimSuffix(name, extension)
	if len(stem) <= len(dimensionalStorageFilenameSuffix) ||
		!strings.EqualFold(stem[len(stem)-len(dimensionalStorageFilenameSuffix):], dimensionalStorageFilenameSuffix) {
		return "", false
	}
	return playerUIDFromCompactHex(stem[:len(stem)-len(dimensionalStorageFilenameSuffix)])
}

func dimensionalPalsFromProperties(
	properties propertyMap,
	storageOwnerUID string,
) ([]Pal, error) {
	if nested, ok := propertyProperties(properties, "SaveData"); ok {
		properties = nested
	}
	arrayProperty := properties["SaveParameterArray"]
	if arrayProperty == nil {
		return nil, fmt.Errorf("SaveParameterArray is missing")
	}
	values, ok := arrayProperty.Value.([]any)
	if !ok {
		return nil, fmt.Errorf("SaveParameterArray is %T", arrayProperty.Value)
	}

	pals := make([]Pal, 0)
	for slotIndex, value := range values {
		wrapper, ok := asProperties(value)
		if !ok {
			return nil, fmt.Errorf("SaveParameterArray[%d] is not a struct", slotIndex)
		}
		parameters, ok := propertyProperties(wrapper, "SaveParameter")
		if !ok {
			return nil, fmt.Errorf("SaveParameterArray[%d] has no SaveParameter", slotIndex)
		}
		characterID := strings.TrimSpace(firstString(
			parameters,
			"CharacterID",
			"CharacterId",
			"character_id",
		))
		if characterID == "" || strings.EqualFold(characterID, "None") {
			continue
		}
		instanceWrapper, ok := propertyProperties(wrapper, "InstanceId")
		if !ok {
			return nil, fmt.Errorf("SaveParameterArray[%d] has no InstanceId", slotIndex)
		}
		instanceID := strings.TrimSpace(firstString(instanceWrapper, "InstanceId", "InstanceID"))
		if instanceID == "" {
			return nil, fmt.Errorf("SaveParameterArray[%d] has an empty InstanceId", slotIndex)
		}
		pal := palFromSaveParameter(parameters, instanceID)
		pal.ContainerID = ""
		pal.BaseID = ""
		pal.SlotIndex = slotIndex
		pal.StorageOwnerUID = storageOwnerUID
		pal.InDimensionalStorage = true
		pal.LocationAccessScope = "unresolved"
		pals = append(pals, *pal)
	}
	return pals, nil
}
