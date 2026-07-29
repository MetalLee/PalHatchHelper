package sav

import (
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func decodeBase64Fixture(encoded []byte) ([]byte, error) {
	return base64.StdEncoding.DecodeString(strings.Join(strings.Fields(string(encoded)), ""))
}

func testContainer(magic string, saveType byte, rawLen uint32, body []byte) []byte {
	result := make([]byte, 12+len(body))
	binary.LittleEndian.PutUint32(result[0:4], rawLen)
	binary.LittleEndian.PutUint32(result[4:8], uint32(len(body)))
	copy(result[8:11], magic)
	result[11] = saveType
	copy(result[12:], body)
	return result
}

func TestPlMHeaderAcceptsOodleMermaidType31(t *testing.T) {
	header, err := parseContainerHeader(testContainer("PlM", 0x31, 4, []byte("body")))
	if err != nil {
		t.Fatalf("parse PlM header: %v", err)
	}
	if header.Magic != "PlM" || header.SaveType != 0x31 || header.Offset != 0 {
		t.Fatalf("unexpected PlM header: %#v", header)
	}
}

func TestPlZType31And32RemainCompatible(t *testing.T) {
	raw := append([]byte("GVAS"), bytes.Repeat([]byte(" synthetic zlib regression body"), 256)...)
	for _, saveType := range []byte{0x31, 0x32} {
		t.Run(fmt.Sprintf("0x%02x", saveType), func(t *testing.T) {
			compressed := zlibCompress(t, raw)
			if saveType == 0x32 {
				compressed = zlibCompress(t, compressed)
			}
			got, header, err := readContainer(
				testContainer("PlZ", saveType, uint32(len(raw)), compressed),
			)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(got, raw) || header.SaveType != saveType {
				t.Fatalf("unexpected PlZ decode: header=%#v body=%q", header, got)
			}
		})
	}
}

func TestRealPlMFixtureDecompressesToSyntheticGVAS(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate test source")
	}
	fixture := filepath.Join(
		filepath.Dir(filename), "..", "..", "..", "data", "parser-fixtures", "plm-minimal",
	)
	container, err := os.ReadFile(filepath.Join(fixture, "Level.sav"))
	if err != nil {
		t.Fatal(err)
	}
	wantEncoded, err := os.ReadFile(filepath.Join(fixture, "Level.gvas.base64"))
	if err != nil {
		t.Fatal(err)
	}
	want, err := decodeBase64Fixture(wantEncoded)
	if err != nil {
		t.Fatal(err)
	}

	got, header, err := readContainer(container)
	if err != nil {
		t.Fatalf("decode real PlM fixture: %v", err)
	}
	if header.Magic != "PlM" || header.SaveType != 0x31 {
		t.Fatalf("unexpected fixture header: %#v", header)
	}
	if !bytes.Equal(got, want) {
		t.Fatal("decoded PlM bytes differ from the synthetic GVAS source")
	}
}

func TestPlMFixtureManifestMatchesCommittedBytes(t *testing.T) {
	fixture := plmFixtureDirectory(t)
	manifestBytes, err := os.ReadFile(filepath.Join(fixture, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		SourceGVAS struct {
			SHA256 string `json:"sha256"`
			Length int    `json:"length"`
		} `json:"source_gvas"`
		Compressed struct {
			SHA256           string `json:"sha256"`
			Length           int    `json:"length"`
			RawLength        int    `json:"raw_length"`
			CompressedLength int    `json:"compressed_length"`
			Magic            string `json:"container_magic"`
			SaveType         string `json:"save_type"`
			Codec            string `json:"compression_codec"`
		} `json:"compressed_save"`
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	encoded, err := os.ReadFile(filepath.Join(fixture, "Level.gvas.base64"))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := decodeBase64Fixture(encoded)
	if err != nil {
		t.Fatal(err)
	}
	container, err := os.ReadFile(filepath.Join(fixture, "Level.sav"))
	if err != nil {
		t.Fatal(err)
	}
	header, err := parseContainerHeader(container)
	if err != nil {
		t.Fatal(err)
	}
	if got := fmt.Sprintf("%x", sha256.Sum256(raw)); got != manifest.SourceGVAS.SHA256 {
		t.Fatalf("raw fixture hash %s does not match manifest %s", got, manifest.SourceGVAS.SHA256)
	}
	if got := fmt.Sprintf("%x", sha256.Sum256(container)); got != manifest.Compressed.SHA256 {
		t.Fatalf("container hash %s does not match manifest %s", got, manifest.Compressed.SHA256)
	}
	if len(raw) != manifest.SourceGVAS.Length ||
		len(container) != manifest.Compressed.Length ||
		int(header.RawLen) != manifest.Compressed.RawLength ||
		int(header.CompressedLen) != manifest.Compressed.CompressedLength ||
		header.Magic != manifest.Compressed.Magic ||
		manifest.Compressed.SaveType != "0x31" ||
		manifest.Compressed.Codec != "Mermaid" {
		t.Fatalf("fixture metadata mismatch: header=%#v manifest=%#v", header, manifest)
	}
}

func TestDecompressedBodyMustBeginWithGVAS(t *testing.T) {
	previous := plmDecoder
	plmDecoder = func(src []byte, rawLen int) ([]byte, error) {
		return bytes.Repeat([]byte{'X'}, rawLen), nil
	}
	t.Cleanup(func() { plmDecoder = previous })

	_, _, err := readContainer(testContainer("PlM", 0x31, 4, []byte("fake")))
	if err == nil || !strings.Contains(err.Error(), "does not begin with GVAS") {
		t.Fatalf("expected non-GVAS rejection, got %v", err)
	}
}

func TestDecompressedLengthMustMatchDeclaration(t *testing.T) {
	previous := plmDecoder
	plmDecoder = func(src []byte, rawLen int) ([]byte, error) {
		return bytes.Repeat([]byte{'G'}, rawLen-1), nil
	}
	t.Cleanup(func() { plmDecoder = previous })

	_, _, err := readContainer(testContainer("PlM", 0x31, 4, []byte("fake")))
	if err == nil || !strings.Contains(err.Error(), "decompressed length") {
		t.Fatalf("expected decompressed length rejection, got %v", err)
	}
}

func TestCorruptedOrTruncatedContainerFailsClosed(t *testing.T) {
	for _, data := range [][]byte{
		[]byte("short"),
		testContainer("PlM", 0x31, 128, []byte("tiny")),
	} {
		if _, _, err := readContainer(data); err == nil {
			t.Fatal("corrupt container unexpectedly decoded")
		}
	}
}

func TestContainerRequiresExactCompressedLength(t *testing.T) {
	container := append(testContainer("PlM", 0x31, 4, []byte("body")), 0)
	if _, _, err := readContainer(container); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("expected compressed length mismatch, got %v", err)
	}
}

func TestPlMRejectsZeroRawLength(t *testing.T) {
	_, _, err := readContainer(testContainer("PlM", 0x31, 0, []byte{0x8c}))
	if err == nil || !strings.Contains(err.Error(), "PLM_DECOMPRESSION_FAILED") {
		t.Fatalf("expected stable decompression failure, got %v", err)
	}
}

func TestDeclaredRawLengthRespectsConfiguredLimit(t *testing.T) {
	t.Setenv("PALHATCH_SAV_MAX_BYTES", "64")
	_, _, err := readContainer(testContainer("PlM", 0x31, 65, []byte{0x8c}))
	var limitError *parseLimitError
	if err == nil || !errors.As(err, &limitError) {
		t.Fatalf("expected decompression limit error, got %v", err)
	}
}

func plmFixtureDirectory(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate test source")
	}
	return filepath.Join(
		filepath.Dir(filename), "..", "..", "..", "data", "parser-fixtures", "plm-minimal",
	)
}

func zlibCompress(t *testing.T, value []byte) []byte {
	t.Helper()
	var encoded bytes.Buffer
	writer := zlib.NewWriter(&encoded)
	if _, err := writer.Write(value); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}
