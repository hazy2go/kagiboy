/* SPI link between the RP2350 (master) and the ESP32-C3 (slave), wallet profile (version 2).
 *
 * Spec: docs/phone-link.md, "SPI link". The wire is the WiFi cartridge's SPI link v1 (12-byte headers, magic, CRC-16,
 * session byte, 4-byte multiples, state rather than messages); what flows is reversed: phone messages that arrived over
 * Bluetooth go to the RP2350, its replies come back. Plain C, no ESP-IDF dependency: the ESP app ships it and the
 * Rust master (firmware/rp2350/core/src/link.rs) is tested against it on the host (test/wl_host.c).
 */
#ifndef WALLET_LINK_H
#define WALLET_LINK_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define WL_VERSION 2
#define WL_HDR 12
#define WL_MAX_MSG 240
#define WL_MAX_XFER (WL_HDR + 244) /* 240 + CRC, padded to 4 */
#define WL_QUEUE 4

#define WL_M_MAGIC 0xC5
#define WL_S_MAGIC 0x5C
enum { WL_POLL = 0, WL_REPLY = 1 };
enum { WL_F_CONNECTED = 1, WL_F_MSG = 4, WL_F_ACCEPTED = 8 };

uint16_t wl_crc16(const uint8_t *p, size_t n);
/* Bytes a body of n payload bytes takes on the wire (payload + CRC, padded to 4); 0 for n == 0. */
size_t wl_body_len(size_t n);

typedef struct {
    uint8_t len;
    uint8_t data[WL_MAX_MSG];
} wl_msg_t;

typedef struct {
    bool connected;           /* a phone is connected over Bluetooth (informational for the master) */
    uint8_t boot;             /* random and != 0, new on every ESP boot: the master then forgets which seq it took */
    uint8_t session;          /* master's session byte (0 = none seen yet) */
    /* phone messages waiting for the master; [0] is offered as `seq` */
    wl_msg_t q[WL_QUEUE];
    uint8_t qn;
    uint8_t seq;              /* seq of q[0]; the next message gets seq + 1 (never 0) */
    /* replies */
    bool accepted;
    uint8_t accepted_seq;
    uint32_t rx_ok, rx_bad, dropped;
} wl_slave_t;

void wl_slave_init(wl_slave_t *s, uint8_t boot);
/* A phone message arrived (Bluetooth write). False if it is too long or the queue is full (the phone retries). */
bool wl_slave_push(wl_slave_t *s, const uint8_t *msg, size_t len);
/* Fills buf (WL_MAX_XFER bytes) with what the next transaction sends; returns the bytes that carry data. */
size_t wl_slave_build_tx(const wl_slave_t *s, uint8_t *buf);
/* A transaction finished: rx holds the n bytes the master sent. Returns the length of a new reply copied to `reply`
 * (WL_MAX_MSG bytes) for the phone, or -1 if there is none. */
int wl_slave_on_rx(wl_slave_t *s, const uint8_t *rx, size_t n, uint8_t *reply);

#endif
