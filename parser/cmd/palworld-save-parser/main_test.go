package main

import (
	"crypto/sha256"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"testing"
	"time"

	parserversion "github.com/MetalLee/PalHatchHelper/parser"
)

func TestParserVersionUsesEmbeddedVersionFile(t *testing.T) {
	if parserVersion != parserversion.Version() || !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(parserVersion) {
		t.Fatalf("unexpected parser version %q", parserVersion)
	}
}

func TestValidatePathsRejectsExistingOutput(t *testing.T) {
	root := t.TempDir()
	snapshot := filepath.Join(root, "snapshot")
	if err := os.Mkdir(snapshot, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(snapshot, "Level.sav"), []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(root, "canonical.json")
	want := []byte("keep-existing-output")
	if err := os.WriteFile(output, want, 0o600); err != nil {
		t.Fatal(err)
	}

	if _, _, err := validatePaths(snapshot, output); err == nil || err.Error() != "OUTPUT_PATH_INVALID" {
		t.Fatalf("expected existing output rejection, got %v", err)
	}
	got, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatal("existing output was modified")
	}
}

func TestRunRealPlMFixtureIsExactDeterministicAndReadOnly(t *testing.T) {
	fixture := fixtureDirectory(t)
	container, err := os.ReadFile(filepath.Join(fixture, "Level.sav"))
	if err != nil {
		t.Fatal(err)
	}
	wantHash := sha256.Sum256(container)
	root := t.TempDir()
	snapshot := filepath.Join(root, "snapshot")
	players := filepath.Join(snapshot, "Players")
	if err := os.MkdirAll(players, 0o755); err != nil {
		t.Fatal(err)
	}
	levelPath := filepath.Join(snapshot, "Level.sav")
	playerPath := filepath.Join(players, "11111111111111111111111111111111.sav")
	for _, path := range []string{levelPath, playerPath} {
		if err := os.WriteFile(path, container, 0o444); err != nil {
			t.Fatal(err)
		}
		fixed := time.Date(2026, 7, 18, 16, 0, 0, 0, time.UTC)
		if err := os.Chtimes(path, fixed, fixed); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PALHATCH_WORLD_UID", "fixture-world-001")
	first := filepath.Join(root, "first.json")
	second := filepath.Join(root, "second.json")
	for _, output := range []string{first, second} {
		if err := run([]string{"--snapshot", snapshot, "--output", output}); err != nil {
			t.Fatalf("parse real PlM fixture: %v", err)
		}
	}
	firstBytes, err := os.ReadFile(first)
	if err != nil {
		t.Fatal(err)
	}
	secondBytes, err := os.ReadFile(second)
	if err != nil {
		t.Fatal(err)
	}
	if string(firstBytes) != string(secondBytes) {
		t.Fatal("identical input produced different JSON")
	}
	var got, want any
	if err := json.Unmarshal(firstBytes, &got); err != nil {
		t.Fatal(err)
	}
	wantBytes, err := os.ReadFile(filepath.Join(fixture, "expected-canonical.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(wantBytes, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("CanonicalSnapshot mismatch\ngot:  %s\nwant: %s", firstBytes, wantBytes)
	}
	for _, path := range []string{levelPath, playerPath} {
		contents, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if sha256.Sum256(contents) != wantHash {
			t.Fatalf("Parser modified input %s", path)
		}
	}
	entries, err := os.ReadDir(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || entries[0].Name() != "Level.sav" || entries[1].Name() != "Players" {
		t.Fatalf("Parser created an unexpected snapshot entry: %v", entries)
	}
}

func TestValidatePathsRejectsPlayersDirectorySymlink(t *testing.T) {
	root := t.TempDir()
	snapshot := filepath.Join(root, "snapshot")
	outside := filepath.Join(root, "outside")
	if err := os.Mkdir(snapshot, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(outside, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(snapshot, "Level.sav"), []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(snapshot, "Players")); err != nil {
		t.Fatal(err)
	}

	if _, _, err := validatePaths(snapshot, filepath.Join(root, "output.json")); err == nil || err.Error() != "SNAPSHOT_INPUT_INVALID" {
		t.Fatalf("expected external Players directory rejection, got %v", err)
	}
}

func TestErrorCodeMapsDecoderFailure(t *testing.T) {
	if got := errorCode(os.ErrInvalid); got != "SAVE_PARSE_FAILED" {
		t.Fatalf("unexpected generic code %q", got)
	}
	if got := errorCode(decompressionError{}); got != "PLM_DECOMPRESSION_FAILED" {
		t.Fatalf("unexpected decompression code %q", got)
	}
}

type decompressionError struct{}

func (decompressionError) Error() string { return "PLM_DECOMPRESSION_FAILED" }

func fixtureDirectory(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate test source")
	}
	return filepath.Join(
		filepath.Dir(filename),
		"..",
		"..",
		"..",
		"data",
		"parser-fixtures",
		"plm-minimal",
	)
}
