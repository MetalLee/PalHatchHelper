package sav

import (
	"strings"
	"testing"
)

func TestWorldUIDMismatchBetweenLevelAndPlayerFails(t *testing.T) {
	_, err := ResolveWorldUID("world-a", "world-a", []string{"world-b"})
	if err == nil || !strings.Contains(err.Error(), "WORLD_UID_MISMATCH") {
		t.Fatalf("expected world UID mismatch, got %v", err)
	}
}

func TestWorldUIDUsesConfiguredValueWhenSaveOmitsIt(t *testing.T) {
	got, err := ResolveWorldUID("fixture-world", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got != "fixture-world" {
		t.Fatalf("world UID = %q", got)
	}
}
