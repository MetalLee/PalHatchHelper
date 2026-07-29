package sav

import "testing"

func FuzzParseContainerHeader(f *testing.F) {
	f.Add([]byte{})
	f.Add([]byte("short"))
	f.Add(testContainer("PlM", 0x31, 64, []byte{0x8c}))
	f.Add(testContainer("PlZ", 0x32, 64, []byte{0x78}))
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 4096 {
			data = data[:4096]
		}
		_, _ = parseContainerHeader(data)
	})
}
