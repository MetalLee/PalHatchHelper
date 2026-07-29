package palooz

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

func TestVendoredDecoderMatchesRecordedFileHashes(t *testing.T) {
	root := vendoredRoot(t)
	noticeBytes, err := os.ReadFile(filepath.Join(root, "UPSTREAM.md"))
	if err != nil {
		t.Fatal(err)
	}
	notice := string(noticeBytes)
	if !strings.Contains(notice, "3395e393466fc1f384dee54dabb3e597e611435e") {
		t.Fatal("pinned upstream commit is missing from provenance notice")
	}
	rowPattern := regexp.MustCompile("\\|\\s*`([^`]+)`\\s*\\|\\s*`([0-9a-f]{64})`\\s*\\|")
	recorded := make(map[string]string)
	for _, match := range rowPattern.FindAllStringSubmatch(notice, -1) {
		recorded[match[1]] = match[2]
	}
	if len(recorded) == 0 {
		t.Fatal("provenance notice contains no vendored file hashes")
	}

	seen := make(map[string]bool)
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || entry.Name() == "UPSTREAM.md" {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		want, ok := recorded[relative]
		if !ok {
			return fmt.Errorf("vendored file missing from provenance table: %s", relative)
		}
		contents, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		got := fmt.Sprintf("%x", sha256.Sum256(contents))
		if got != want {
			return fmt.Errorf("vendored file hash mismatch for %s: got %s want %s", relative, got, want)
		}
		seen[relative] = true
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(seen) != len(recorded) {
		t.Fatalf("provenance table records %d files but found %d", len(recorded), len(seen))
	}
}

func vendoredRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate test source")
	}
	return filepath.Join(filepath.Dir(filename), "..", "..", "third_party", "palooz")
}
