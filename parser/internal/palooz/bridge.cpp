#include "bridge.h"

#include <limits.h>

int Kraken_Decompress(
    const uint8_t *src,
    size_t src_len,
    uint8_t *dst,
    size_t dst_len);

extern "C" int palbeacon_palooz_decompress(
    const uint8_t *src,
    size_t src_len,
    uint8_t *dst,
    size_t dst_len) {
  if (src == nullptr || src_len == 0 || dst == nullptr || dst_len == 0 ||
      dst_len > INT_MAX) {
    return -1;
  }
  return Kraken_Decompress(src, src_len, dst, dst_len);
}
