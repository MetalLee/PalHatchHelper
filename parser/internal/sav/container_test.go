package sav

import (
	"bytes"
	"encoding/binary"
	"strings"
	"testing"
)

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

func TestDecompressedBodyMustBeginWithGVAS(t *testing.T) {
	previous := oodleDecoder
	oodleDecoder = func(src []byte, rawLen int) ([]byte, error) {
		return bytes.Repeat([]byte{'X'}, rawLen), nil
	}
	t.Cleanup(func() { oodleDecoder = previous })

	_, _, err := readContainer(testContainer("PlM", 0x31, 4, []byte("fake")))
	if err == nil || !strings.Contains(err.Error(), "does not begin with GVAS") {
		t.Fatalf("expected non-GVAS rejection, got %v", err)
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
