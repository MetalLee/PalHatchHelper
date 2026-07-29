package palooz

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDecompressRealMermaidFixture(t *testing.T) {
	container, want := fixtureBytes(t)
	got, err := Decompress(container[12:], len(want))
	if err != nil {
		t.Fatalf("decompress fixture: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatal("decoded bytes differ from synthetic source")
	}
	if len(got) != len(want) || cap(got) != len(want) {
		t.Fatalf("padding escaped result: len=%d cap=%d", len(got), cap(got))
	}
}

func TestDecompressRejectsInvalidBoundaries(t *testing.T) {
	container, want := fixtureBytes(t)
	for _, test := range []struct {
		name   string
		src    []byte
		rawLen int
	}{
		{name: "empty input", src: nil, rawLen: len(want)},
		{name: "zero raw length", src: container[12:], rawLen: 0},
		{name: "short stream", src: []byte{0x8c}, rawLen: len(want)},
		{name: "truncated stream", src: container[12 : len(container)-1], rawLen: len(want)},
		{name: "random garbage", src: []byte("not-an-oodle-stream"), rawLen: len(want)},
		{name: "decoder return overflow", src: container[12:], rawLen: mathMaxInt32PlusOne()},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := Decompress(test.src, test.rawLen); !errorsIsDecompression(err) {
				t.Fatalf("expected stable decompression error, got %v", err)
			}
		})
	}
}

func fixtureBytes(t *testing.T) ([]byte, []byte) {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate test source")
	}
	root := filepath.Join(
		filepath.Dir(filename), "..", "..", "..", "data", "parser-fixtures", "plm-minimal",
	)
	container, err := os.ReadFile(filepath.Join(root, "Level.sav"))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := os.ReadFile(filepath.Join(root, "Level.gvas.base64"))
	if err != nil {
		t.Fatal(err)
	}
	want, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(string(encoded)), ""))
	if err != nil {
		t.Fatal(err)
	}
	return container, want
}

func errorsIsDecompression(err error) bool {
	return err != nil && err.Error() == ErrDecompressionFailed.Error()
}

func mathMaxInt32PlusOne() int {
	return int(int64(1) << 31)
}
