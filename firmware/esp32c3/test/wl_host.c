/* The ESP32-C3 half of the SPI link (components/wallet_link, the code that ships) on the host, driven over stdin by
 * the Rust master's test (firmware/rp2350/core/tests/spi_link.rs). Binary commands, little-endian:
 *   'I' boot            restart the ESP (new boot id, queue and state gone)
 *   'C' on              phone connected or not
 *   'P' len data        a phone message arrived over Bluetooth            -> 'k' ok(1)/full(0)
 *   'X' n(u16) mosi     one SPI transaction: the master's n bytes in      -> 'x' + the ESP's n bytes out
 *   'R'                 replies passed to the phone since the last 'R'    -> count, then len + bytes each
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wallet_link.h"

static wl_slave_t s;
static uint8_t tx[WL_MAX_XFER];
static uint8_t replies[64][WL_MAX_MSG + 1];
static int nrep;

static int rd(void)
{
    int c = getchar();
    if (c == EOF)
        exit(0);
    return c;
}

int main(void)
{
    wl_slave_init(&s, 1);
    wl_slave_build_tx(&s, tx);
    for (;;) {
        int c = rd();
        if (c == 'I') {
            wl_slave_init(&s, (uint8_t)rd());
            wl_slave_build_tx(&s, tx);
        } else if (c == 'C') {
            s.connected = rd() != 0;
            wl_slave_build_tx(&s, tx);
        } else if (c == 'P') {
            uint8_t m[256];
            int n = rd();
            for (int i = 0; i < n; i++)
                m[i] = (uint8_t)rd();
            putchar('k');
            putchar(wl_slave_push(&s, m, (size_t)n));
            wl_slave_build_tx(&s, tx); /* the app rebuilds when nothing is queued for DMA (link.c) */
        } else if (c == 'X') {
            int n = rd();
            n |= rd() << 8;
            uint8_t rx[WL_MAX_XFER];
            for (int i = 0; i < n; i++)
                rx[i] = (uint8_t)rd();
            putchar('x');
            fwrite(tx, 1, (size_t)n, stdout); /* MISO: the buffer queued before the master clocked */
            uint8_t rep[WL_MAX_MSG];
            int r = wl_slave_on_rx(&s, rx, (size_t)n, rep);
            if (r > 0 && nrep < 64) {
                replies[nrep][0] = (uint8_t)r;
                memcpy(replies[nrep] + 1, rep, (size_t)r);
                nrep++;
            }
            wl_slave_build_tx(&s, tx);
        } else if (c == 'R') {
            putchar(nrep);
            for (int i = 0; i < nrep; i++)
                fwrite(replies[i], 1, (size_t)replies[i][0] + 1, stdout);
            nrep = 0;
        } else {
            fprintf(stderr, "wl_host: bad command %d\n", c);
            return 1;
        }
        fflush(stdout);
    }
}
