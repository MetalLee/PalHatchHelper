//go:build amd64 && cgo && (linux || windows)

// Package palooz exposes the decode-only palooz/ooz core through a bounded C ABI.
package palooz

/*
#cgo CPPFLAGS: -I${SRCDIR}/../../third_party/palooz/ooz/dep/ooz/simde
#cgo CXXFLAGS: -std=c++17 -DOOZ_BUILD_DLL=1 -DPALBEACON_DECODE_ONLY=1 -O2
#include "bridge.h"
*/
import "C"

import (
	"errors"
	"math"
	"runtime"
	"unsafe"
)

const outputSafetyPadding = 64

// ErrDecompressionFailed is the stable error returned for every decoder failure.
var ErrDecompressionFailed = errors.New("PLM_DECOMPRESSION_FAILED")

// Decompress decodes one complete PlM payload and returns exactly rawLen bytes.
func Decompress(src []byte, rawLen int) ([]byte, error) {
	if len(src) == 0 || rawLen <= 0 || rawLen > math.MaxInt32 {
		return nil, ErrDecompressionFailed
	}
	maxInt := int(^uint(0) >> 1)
	if rawLen > maxInt-outputSafetyPadding {
		return nil, ErrDecompressionFailed
	}

	padded := make([]byte, rawLen+outputSafetyPadding)
	written := C.palbeacon_palooz_decompress(
		(*C.uint8_t)(unsafe.Pointer(&src[0])),
		C.size_t(len(src)),
		(*C.uint8_t)(unsafe.Pointer(&padded[0])),
		C.size_t(rawLen),
	)
	runtime.KeepAlive(src)
	runtime.KeepAlive(padded)
	if int64(written) != int64(rawLen) {
		return nil, ErrDecompressionFailed
	}
	return padded[:rawLen:rawLen], nil
}
