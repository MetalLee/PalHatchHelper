package sav

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOodleLibraryMissingFailsWithoutDownload(t *testing.T) {
	t.Setenv("PALHATCH_OODLE_LIB", "")
	t.Setenv("PALHATCH_OODLE_SHA256", strings.Repeat("a", 64))

	_, err := resolveOodleLibrary(t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "OODLE_LIBRARY_MISSING") {
		t.Fatalf("expected missing-library error, got %v", err)
	}
}

func TestOodleLibraryHashMismatchFailsBeforeLoad(t *testing.T) {
	bundle := t.TempDir()
	library := filepath.Join(bundle, "lib", oodleLibrary)
	if err := os.MkdirAll(filepath.Dir(library), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(library, []byte("synthetic-not-a-library"), 0o600); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte("different"))
	t.Setenv("PALHATCH_OODLE_LIB", library)
	t.Setenv("PALHATCH_OODLE_SHA256", fmt.Sprintf("%x", digest))

	_, err := resolveOodleLibrary(bundle)
	if err == nil || !strings.Contains(err.Error(), "OODLE_HASH_MISMATCH") {
		t.Fatalf("expected hash mismatch, got %v", err)
	}
}
