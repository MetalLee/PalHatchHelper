// Modified by PalHatchHelper from 8tp/palhelm commit e099e8afe4823d6cf6b371e5e3938955e5a1becd.
package sav

import (
	"crypto/sha256"
	"crypto/subtle"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

const oodleLibrary = "liboo2corelinux64.so.9"

var (
	oodleDecoder = oodleDecompress
	oodleSetup   struct {
		sync.Once
		err error
	}
	sha256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

func oodleDecompress(src []byte, rawLen int) ([]byte, error) {
	oodleSetup.Do(func() {
		bundle, err := parserBundleDirectory()
		if err != nil {
			oodleSetup.err = err
			return
		}
		path, err := resolveOodleLibrary(bundle)
		if err != nil {
			oodleSetup.err = err
			return
		}
		if err := loadOodleLibrary(path); err != nil {
			oodleSetup.err = fmt.Errorf("OODLE_LIBRARY_LOAD_FAILED")
		}
	})
	if oodleSetup.err != nil {
		return nil, oodleSetup.err
	}
	out, err := callOodleDecompress(src, rawLen)
	if err != nil {
		return nil, fmt.Errorf("OODLE_DECOMPRESSION_FAILED")
	}
	return out, nil
}

func parserBundleDirectory() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("PARSER_BUNDLE_UNAVAILABLE")
	}
	resolved, err := filepath.EvalSymlinks(executable)
	if err != nil {
		return "", fmt.Errorf("PARSER_BUNDLE_UNAVAILABLE")
	}
	return filepath.Dir(resolved), nil
}

func resolveOodleLibrary(bundleDirectory string) (string, error) {
	libraryPath := os.Getenv("PALHATCH_OODLE_LIB")
	if libraryPath == "" {
		libraryPath = filepath.Join(bundleDirectory, "lib", oodleLibrary)
	}
	if !filepath.IsAbs(libraryPath) {
		return "", fmt.Errorf("OODLE_LIBRARY_PATH_INVALID")
	}
	info, err := os.Lstat(libraryPath)
	if os.IsNotExist(err) {
		return "", fmt.Errorf("OODLE_LIBRARY_MISSING")
	}
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("OODLE_LIBRARY_INVALID")
	}

	expected, err := expectedOodleSHA256(libraryPath)
	if err != nil {
		return "", err
	}
	contents, err := os.ReadFile(libraryPath)
	if err != nil {
		return "", fmt.Errorf("OODLE_LIBRARY_UNREADABLE")
	}
	actual := fmt.Sprintf("%x", sha256.Sum256(contents))
	if subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) != 1 {
		return "", fmt.Errorf("OODLE_HASH_MISMATCH")
	}
	return libraryPath, nil
}

func expectedOodleSHA256(libraryPath string) (string, error) {
	expected := strings.ToLower(strings.TrimSpace(os.Getenv("PALHATCH_OODLE_SHA256")))
	if expected == "" {
		pin, err := os.ReadFile(libraryPath + ".sha256")
		if os.IsNotExist(err) {
			return "", fmt.Errorf("OODLE_HASH_PIN_MISSING")
		}
		if err != nil || len(pin) > 256 {
			return "", fmt.Errorf("OODLE_HASH_PIN_INVALID")
		}
		fields := strings.Fields(string(pin))
		if len(fields) == 0 {
			return "", fmt.Errorf("OODLE_HASH_PIN_INVALID")
		}
		expected = strings.ToLower(fields[0])
	}
	if !sha256Pattern.MatchString(expected) {
		return "", fmt.Errorf("OODLE_HASH_PIN_INVALID")
	}
	return expected, nil
}
