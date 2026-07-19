package sav

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func writeTestFString(t *testing.T, destination *bytes.Buffer, value string) {
	t.Helper()
	if err := binary.Write(destination, binary.LittleEndian, int32(len(value)+1)); err != nil {
		t.Fatal(err)
	}
	destination.WriteString(value)
	destination.WriteByte(0)
}

func TestSetPropertyTagKeepsFollowingPropertyAligned(t *testing.T) {
	var encoded bytes.Buffer
	writeTestFString(t, &encoded, "IgnoredSet")
	writeTestFString(t, &encoded, "SetProperty")
	setBody := make([]byte, 8)
	if err := binary.Write(&encoded, binary.LittleEndian, uint64(len(setBody))); err != nil {
		t.Fatal(err)
	}
	writeTestFString(t, &encoded, "Guid")
	encoded.WriteByte(0)
	encoded.Write(setBody)

	writeTestFString(t, &encoded, "Answer")
	writeTestFString(t, &encoded, "IntProperty")
	if err := binary.Write(&encoded, binary.LittleEndian, uint64(4)); err != nil {
		t.Fatal(err)
	}
	encoded.WriteByte(0)
	if err := binary.Write(&encoded, binary.LittleEndian, int32(42)); err != nil {
		t.Fatal(err)
	}
	writeTestFString(t, &encoded, "None")

	stats := newStats()
	properties, err := readProperties(newReaderWithStats(encoded.Bytes(), &stats), "", &stats)
	if err != nil {
		t.Fatalf("read properties: %v", err)
	}
	answer, ok := properties["Answer"]
	if !ok || answer.Value != int32(42) {
		t.Fatalf("following property was misaligned: %#v", answer)
	}
}

func TestPlayerGVASUsesAnIndependentSecurityBudget(t *testing.T) {
	var encoded bytes.Buffer
	if err := binary.Write(&encoded, binary.LittleEndian, uint32(0x53415647)); err != nil {
		t.Fatal(err)
	}
	for _, value := range []int32{3, 0, 0} {
		if err := binary.Write(&encoded, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	for _, value := range []uint16{5, 1, 0} {
		if err := binary.Write(&encoded, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	if err := binary.Write(&encoded, binary.LittleEndian, uint32(0)); err != nil {
		t.Fatal(err)
	}
	writeTestFString(t, &encoded, "test-branch")
	if err := binary.Write(&encoded, binary.LittleEndian, int32(3)); err != nil {
		t.Fatal(err)
	}
	if err := binary.Write(&encoded, binary.LittleEndian, uint32(0)); err != nil {
		t.Fatal(err)
	}
	writeTestFString(t, &encoded, "TestSaveGame")
	writeTestFString(t, &encoded, "None")

	aggregate := newStats()
	aggregate.propertyCount = maxPropertyCount
	aggregate.decodedNodes = maxDecodedNodes
	aggregate.decodedBytes = maxDecodedBytes
	if _, err := parsePlayerGVAS(encoded.Bytes(), &aggregate); err != nil {
		t.Fatalf("parse isolated player GVAS: %v", err)
	}
	if aggregate.propertyCount != maxPropertyCount ||
		aggregate.decodedNodes != maxDecodedNodes ||
		aggregate.decodedBytes != maxDecodedBytes {
		t.Fatalf("player parse changed aggregate security budget: %#v", aggregate)
	}
}
