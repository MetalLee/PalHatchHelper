package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/MetalLee/PalHatchHelper/parser/internal/canonical"
	"github.com/MetalLee/PalHatchHelper/parser/internal/sav"
)

const (
	parserName     = "palhatch-plm-save-parser"
	parserVersion  = "1.1.0"
	maxOutputBytes = 64 * 1024 * 1024
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "PALHATCH_PARSER_ERROR code=%s\n", errorCode(err))
		os.Exit(1)
	}
}

func run(arguments []string) error {
	flags := flag.NewFlagSet(parserName, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	snapshotArgument := flags.String("snapshot", "", "read-only snapshot directory")
	outputArgument := flags.String("output", "", "CanonicalSnapshot output")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return errors.New("ARGUMENTS_INVALID")
	}
	if *snapshotArgument == "" || *outputArgument == "" {
		return errors.New("ARGUMENTS_INVALID")
	}

	snapshot, output, err := validatePaths(*snapshotArgument, *outputArgument)
	if err != nil {
		return err
	}
	levelPath := filepath.Join(snapshot, "Level.sav")
	format, err := sav.InspectContainer(levelPath)
	if err != nil {
		return err
	}
	world, err := sav.ParseLevel(levelPath, sav.Options{PlayersDir: filepath.Join(snapshot, "Players")})
	if err != nil {
		return err
	}
	playerWorldUIDs := make([]string, 0, len(world.Players))
	for _, player := range world.Players {
		playerWorldUIDs = append(playerWorldUIDs, player.WorldUID)
	}
	worldUID, err := sav.ResolveWorldUID(os.Getenv("PALHATCH_WORLD_UID"), world.Meta.WorldUID, playerWorldUIDs)
	if err != nil {
		return err
	}
	levelInfo, err := os.Lstat(levelPath)
	if err != nil {
		return errors.New("SNAPSHOT_INPUT_INVALID")
	}
	result, warnings, err := canonical.Build(world, worldUID, format, levelInfo.ModTime())
	if err != nil {
		return err
	}
	for _, warning := range warnings {
		fmt.Fprintf(os.Stderr, "PALHATCH_PARSER_WARNING code=%s count=%d\n", warning.Code, warning.Count)
	}
	return writeOutput(output, result)
}

func validatePaths(snapshotArgument, outputArgument string) (string, string, error) {
	snapshotInfo, err := os.Lstat(snapshotArgument)
	if err != nil || !snapshotInfo.IsDir() || snapshotInfo.Mode()&os.ModeSymlink != 0 {
		return "", "", errors.New("SNAPSHOT_INPUT_INVALID")
	}
	snapshot, err := filepath.EvalSymlinks(snapshotArgument)
	if err != nil {
		return "", "", errors.New("SNAPSHOT_INPUT_INVALID")
	}
	snapshot, err = filepath.Abs(snapshot)
	if err != nil {
		return "", "", errors.New("SNAPSHOT_INPUT_INVALID")
	}
	output, err := filepath.Abs(outputArgument)
	if err != nil {
		return "", "", errors.New("OUTPUT_PATH_INVALID")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(output))
	if err != nil {
		return "", "", errors.New("OUTPUT_PATH_INVALID")
	}
	parent, err = filepath.Abs(parent)
	if err != nil || parent == snapshot || strings.HasPrefix(parent, snapshot+string(os.PathSeparator)) {
		return "", "", errors.New("OUTPUT_PATH_INVALID")
	}
	output = filepath.Join(parent, filepath.Base(output))
	if _, err := os.Lstat(output); !os.IsNotExist(err) {
		return "", "", errors.New("OUTPUT_PATH_INVALID")
	}
	return snapshot, output, nil
}

type limitedWriter struct {
	destination io.Writer
	written     int
}

func (writer *limitedWriter) Write(value []byte) (int, error) {
	if len(value) > maxOutputBytes-writer.written {
		return 0, errors.New("OUTPUT_TOO_LARGE")
	}
	n, err := writer.destination.Write(value)
	writer.written += n
	return n, err
}

func writeOutput(path string, value canonical.Snapshot) (resultError error) {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return errors.New("OUTPUT_WRITE_FAILED")
	}
	keep := false
	defer func() {
		_ = file.Close()
		if !keep {
			_ = os.Remove(path)
		}
	}()
	writer := &limitedWriter{destination: file}
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		if strings.Contains(err.Error(), "OUTPUT_TOO_LARGE") {
			return errors.New("OUTPUT_TOO_LARGE")
		}
		return errors.New("OUTPUT_WRITE_FAILED")
	}
	if err := file.Sync(); err != nil {
		return errors.New("OUTPUT_WRITE_FAILED")
	}
	if err := file.Close(); err != nil {
		return errors.New("OUTPUT_WRITE_FAILED")
	}
	keep = true
	return nil
}

func errorCode(err error) string {
	message := err.Error()
	known := []string{
		"ARGUMENTS_INVALID", "SNAPSHOT_INPUT_INVALID", "OUTPUT_PATH_INVALID",
		"OUTPUT_TOO_LARGE", "OUTPUT_WRITE_FAILED", "WORLD_UID_MISSING", "WORLD_UID_MISMATCH",
		"GAME_ID_NORMALIZATION_COLLISION",
		"OODLE_LIBRARY_MISSING", "OODLE_LIBRARY_INVALID", "OODLE_LIBRARY_PATH_INVALID",
		"OODLE_LIBRARY_UNREADABLE", "OODLE_HASH_PIN_MISSING", "OODLE_HASH_PIN_INVALID",
		"OODLE_HASH_MISMATCH", "OODLE_LIBRARY_LOAD_FAILED", "OODLE_DECOMPRESSION_FAILED",
	}
	for _, code := range known {
		if strings.Contains(message, code) {
			return code
		}
	}
	if strings.Contains(message, "GVAS") {
		return "DECOMPRESSED_BODY_INVALID"
	}
	return "SAVE_PARSE_FAILED"
}
