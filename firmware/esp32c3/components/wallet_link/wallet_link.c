/* SPI link, wallet profile: the ESP32-C3 half. Spec: docs/phone-link.md, "SPI link". */
#include "wallet_link.h"

#include <string.h>

uint16_t wl_crc16(const uint8_t *p, size_t n)
{
    uint16_t c = 0xFFFF;
    while (n--) {
        c ^= (uint16_t)(*p++ << 8);
        for (int i = 0; i < 8; i++)
            c = (uint16_t)(c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1);
    }
    return c;
}

size_t wl_body_len(size_t n)
{
    return n ? (n + 2 + 3) & ~(size_t)3 : 0;
}

static void put_crc(uint8_t *at, const uint8_t *p, size_t n)
{
    uint16_t c = wl_crc16(p, n);
    at[0] = (uint8_t)(c >> 8);
    at[1] = (uint8_t)c;
}

static bool crc_ok(const uint8_t *p, size_t n)
{
    uint16_t c = wl_crc16(p, n);
    return p[n] == (uint8_t)(c >> 8) && p[n + 1] == (uint8_t)c;
}

void wl_slave_init(wl_slave_t *s, uint8_t boot)
{
    memset(s, 0, sizeof *s);
    s->seq = 1;
    s->boot = boot ? boot : 1;
}

bool wl_slave_push(wl_slave_t *s, const uint8_t *msg, size_t len)
{
    if (len == 0 || len > WL_MAX_MSG || s->qn == WL_QUEUE) {
        s->dropped++;
        return false;
    }
    s->q[s->qn].len = (uint8_t)len;
    memcpy(s->q[s->qn].data, msg, len);
    s->qn++;
    return true;
}

size_t wl_slave_build_tx(const wl_slave_t *s, uint8_t *buf)
{
    memset(buf, 0, WL_MAX_XFER);
    bool msg = s->qn > 0;
    buf[0] = WL_S_MAGIC;
    buf[1] = (uint8_t)((s->connected ? WL_F_CONNECTED : 0) | (msg ? WL_F_MSG : 0) | (s->accepted ? WL_F_ACCEPTED : 0));
    buf[2] = s->boot;
    buf[3] = msg ? s->seq : 0;
    buf[5] = msg ? s->q[0].len : 0;
    buf[8] = s->accepted ? s->accepted_seq : 0;
    buf[9] = WL_VERSION;
    put_crc(buf + 10, buf, 10);
    if (!msg)
        return WL_HDR;
    memcpy(buf + WL_HDR, s->q[0].data, s->q[0].len);
    put_crc(buf + WL_HDR + s->q[0].len, buf + WL_HDR, s->q[0].len);
    return WL_HDR + wl_body_len(s->q[0].len);
}

int wl_slave_on_rx(wl_slave_t *s, const uint8_t *rx, size_t n, uint8_t *reply)
{
    if (n < WL_HDR || rx[0] != WL_M_MAGIC || !crc_ok(rx, 10)) {
        s->rx_bad++;
        return -1;
    }
    if (rx[7] != s->session) {
        /* first contact, or the RP2350 restarted: its reply bookkeeping starts over; queued phone messages stay
         * (the new master hasn't taken any of them) */
        s->session = rx[7];
        s->accepted = false;
    }
    /* the master has taken the offered message: offer the next one (an ack from before this boot is not ours) */
    if ((rx[2] & 1) && rx[5] == s->boot && s->qn && rx[3] == s->seq) {
        memmove(s->q, s->q + 1, (size_t)(s->qn - 1) * sizeof s->q[0]);
        s->qn--;
        s->seq = (uint8_t)(s->seq == 255 ? 1 : s->seq + 1);
    }
    int out = -1;
    if (rx[1] == WL_REPLY) {
        uint8_t seq = rx[4], len = rx[6];
        if (len == 0 || len > WL_MAX_MSG || n < WL_HDR + wl_body_len(len) || !crc_ok(rx + WL_HDR, len)) {
            s->rx_bad++;
            return -1;
        }
        if (!(s->accepted && seq == s->accepted_seq)) { /* a repeat of the reply already passed on is ignored */
            memcpy(reply, rx + WL_HDR, len);
            out = len;
            s->accepted = true;
            s->accepted_seq = seq;
        }
    }
    s->rx_ok++;
    return out;
}
