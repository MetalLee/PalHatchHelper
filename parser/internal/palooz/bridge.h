#ifndef PALBEACON_PALOOZ_BRIDGE_H
#define PALBEACON_PALOOZ_BRIDGE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int palbeacon_palooz_decompress(
    const uint8_t *src,
    size_t src_len,
    uint8_t *dst,
    size_t dst_len);

#ifdef __cplusplus
}
#endif

#endif
