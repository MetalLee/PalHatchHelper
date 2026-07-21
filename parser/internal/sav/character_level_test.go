package sav

import "testing"

func TestPalLevelDefaultsToOneOnlyWhenPropertyIsAbsent(t *testing.T) {
	if level := palLevel(propertyMap{}); level != 1 {
		t.Fatalf("missing Level must use the game default 1, got %d", level)
	}

	if level := palLevel(propertyMap{
		"Level": &property{Value: int32(42)},
	}); level != 42 {
		t.Fatalf("explicit Level must be preserved, got %d", level)
	}

	if level := palLevel(propertyMap{
		"Level": &property{Value: "not-numeric"},
	}); level != 0 {
		t.Fatalf("an undecodable explicit Level must remain unknown, got %d", level)
	}
}
