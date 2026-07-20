package sav

import (
	"fmt"
	"strings"
)

// ResolveWorldUID requires every available save identity to agree with the
// explicitly configured world identity. Palworld saves that omit this field
// use the configured value; no directory-name guess is made.
func ResolveWorldUID(configured, level string, players []string) (string, error) {
	configured = strings.TrimSpace(configured)
	level = strings.TrimSpace(level)
	effective := level
	if effective == "" {
		effective = configured
	}
	if effective == "" {
		return "", fmt.Errorf("WORLD_UID_MISSING")
	}
	if configured != "" && !strings.EqualFold(configured, effective) {
		return "", fmt.Errorf("WORLD_UID_MISMATCH")
	}
	for _, player := range players {
		player = strings.TrimSpace(player)
		if player != "" && !strings.EqualFold(player, effective) {
			return "", fmt.Errorf("WORLD_UID_MISMATCH")
		}
	}
	return effective, nil
}
