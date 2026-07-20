package sav

/*
#cgo LDFLAGS: -ldl
#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>

typedef intptr_t (*oodle_decompress_fn)(
    const void *, intptr_t, void *, intptr_t,
    int, int, int, void *, size_t, void *, void *, void *, size_t, int);

static void *palhatch_oodle_open(const char *path) {
    return dlopen(path, RTLD_NOW | RTLD_LOCAL);
}

static intptr_t palhatch_oodle_decompress(
    void *handle, const void *src, intptr_t src_len, void *dst, intptr_t dst_len) {
    oodle_decompress_fn fn = (oodle_decompress_fn)dlsym(handle, "OodleLZ_Decompress");
    if (fn == NULL) {
        return 0;
    }
    return fn(src, src_len, dst, dst_len, 0, 0, 0, NULL, 0, NULL, NULL, NULL, 0, 3);
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

var oodleHandle unsafe.Pointer

func loadOodleLibrary(path string) error {
	cPath := C.CString(path)
	defer C.free(unsafe.Pointer(cPath))
	oodleHandle = C.palhatch_oodle_open(cPath)
	if oodleHandle == nil {
		return fmt.Errorf("OODLE_LIBRARY_LOAD_FAILED")
	}
	return nil
}

func callOodleDecompress(src []byte, rawLen int) ([]byte, error) {
	if oodleHandle == nil || len(src) == 0 || rawLen <= 0 {
		return nil, fmt.Errorf("OODLE_DECOMPRESSION_FAILED")
	}
	out := make([]byte, rawLen)
	written := C.palhatch_oodle_decompress(
		oodleHandle,
		unsafe.Pointer(&src[0]),
		C.intptr_t(len(src)),
		unsafe.Pointer(&out[0]),
		C.intptr_t(rawLen),
	)
	if int(written) != rawLen {
		return nil, fmt.Errorf("OODLE_DECOMPRESSION_FAILED")
	}
	return out, nil
}
