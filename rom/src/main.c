/*
 * Game Boy side of the wallet. This ROM is only the trusted screen and
 * buttons: it never sees a private key. Everything secret lives in the
 * cartridge chip, reached through the mailbox described in docs/protocol.md.
 */
#include <gb/gb.h>
#include <stdint.h>
#include <string.h>
#include "brand.h"
#include "gfx.h"

#define MB ((volatile uint8_t *)0xD800)
#define MB_REQ_SEQ 0x00
#define MB_CMD 0x01
#define MB_REQ_LEN 0x02
#define MB_ARG 0x03
#define MB_REQ 0x04
#define MB_RESP_SEQ 0x40
#define MB_STATUS 0x41
#define MB_RESP_LEN 0x42
#define MB_RESP 0x44
#define MB_MAGIC 0xF0
#define MB_ACCEL_X 0xF1
#define MB_ACCEL_Y 0xF2
#define MB_PENDING 0xF3

#define CHIP_MAGIC 0xC7
#define RESP_MAX 171
#define REQ_MAX 60

#define CMD_PING 0x01
#define CMD_ENTROPY 0x02
#define CMD_CREATE 0x03
#define CMD_SET_PIN 0x04
#define CMD_UNLOCK 0x05
#define CMD_ACCOUNT 0x06
#define CMD_PENDING 0x07
#define CMD_SIGN 0x08
#define CMD_WIPE 0x09
#define CMD_TXSTATUS 0x0A
#define CMD_LOCK 0x0B
#define CMD_QR 0x0C
#define CMD_WORDS 0x0D
#define CMD_RESTORE 0x0E
#define CMD_NETWORK 0x0F
#define CMD_PAIR 0x10

#define ST_TIMEOUT 0xFE

#define STATE_NONE 0
#define STATE_LOCKED 1
#define STATE_UNLOCKED 2

#define CHAIN_SOL 0
#define CHAIN_EVM 1

static uint8_t seq;
static char resp[RESP_MAX + 1];
static uint8_t resp_len;
static uint8_t ent[REQ_MAX];
static uint8_t ent_len;
static uint8_t pin[4];
static uint8_t frame;

/* ---------- chip mailbox ---------- */
#ifdef DEMO_CHIP
/*
 * `make demo`: an in-ROM stand-in for the key chip, so a flash cart on a real
 * Game Boy (no chip) can walk through every screen for photos. It serves canned
 * replies generated from the real browser chip (assets/gen_demo_chip.mts) for
 * the website's attract-mode wallet. No keys, no signing: testnet demo only.
 * The cartridge's save RAM (MBC1 + battery, or a flash cart's FRAM) remembers
 * that a wallet exists, its PIN and the tries left, so power-on lands on the
 * PIN screen like the real cartridge. Wipe from the menu to start over.
 */
#include "demo_chip.h"

#define DEMO_TRIES 5
static uint8_t demo_state;    /* STATE_NONE / LOCKED / UNLOCKED */
static uint8_t demo_seeded;   /* words created or restored, PIN not yet set */
static uint8_t demo_pin[4];
static uint8_t demo_tries;
static uint8_t demo_pool[4];
static uint8_t demo_pending;  /* 0 none, 1 Solana, 2 Ethereum */
static uint8_t demo_next;     /* which chain the next request is for */
static uint8_t demo_tx_chain; /* chain of the last signed request, 0 none */
static uint8_t demo_tx_polls;
static uint8_t demo_net;      /* EVM network on the home card, index into demo_account_evm */

static void demo_reply(const uint8_t *src, uint8_t len) {
    memcpy(resp, src, len);
    resp_len = len;
    resp[len] = 0;
}

static void demo_reply_str(const char *a, const char *b) {
    /* "a\0b\0" */
    uint8_t n = strlen(a), m = strlen(b);
    memcpy(resp, a, n + 1);
    memcpy(resp + n + 1, b, m + 1);
    resp_len = n + m + 2;
}

/* the real chip takes a moment for these; long enough to photograph the screen */
static void demo_think(void) {
    uint8_t i;
    for (i = 0; i < 90; i++) {
        vsync();
        anim_tick(++frame);
    }
}

/* save RAM layout at 0xA000; never holds "unlocked", so power-on is always locked */
typedef struct {
    uint8_t magic[3];
    uint8_t state;
    uint8_t pin[4];
    uint8_t tries;
    uint8_t sum;
} demo_save_t;
#define DEMO_SAVE ((demo_save_t *)0xA000)
static uint8_t demo_loaded;

static uint8_t demo_sum(const demo_save_t *v) {
    const uint8_t *b = (const uint8_t *)v;
    uint8_t i, x = 0x5A;
    for (i = 0; i < sizeof(demo_save_t) - 1; i++) x = (x << 1 | x >> 7) ^ b[i];
    return x;
}

static void demo_store(void) {
    demo_save_t v;
    v.magic[0] = 'K';
    v.magic[1] = 'G';
    v.magic[2] = 1;
    v.state = demo_state == STATE_NONE ? STATE_NONE : STATE_LOCKED;
    memcpy(v.pin, demo_pin, 4);
    v.tries = demo_tries;
    v.sum = demo_sum(&v);
    ENABLE_RAM;
    memcpy(DEMO_SAVE, &v, sizeof v);
    DISABLE_RAM;
}

static void demo_load(void) {
    demo_save_t v;
    ENABLE_RAM;
    memcpy(&v, DEMO_SAVE, sizeof v);
    DISABLE_RAM;
    /* blank or corrupt save RAM reads as a fresh cartridge */
    if (v.magic[0] != 'K' || v.magic[1] != 'G' || v.magic[2] != 1 || v.sum != demo_sum(&v)) return;
    if (v.state != STATE_LOCKED || !v.tries || v.tries > DEMO_TRIES) return;
    demo_state = STATE_LOCKED;
    memcpy(demo_pin, v.pin, 4);
    demo_tries = v.tries;
}

static void demo_wipe(void) {
    demo_state = STATE_NONE;
    demo_seeded = 0;
    demo_pending = 0;
    demo_tx_chain = 0;
    memset(demo_pin, 0, 4);
    demo_tries = 0;
    demo_store();
}

static uint8_t demo_call(uint8_t cmd, uint8_t arg, const uint8_t *data, uint8_t len) {
    uint8_t i, n;
    resp_len = 0;
    resp[0] = 0;
    vsync(); /* a real round trip takes at least a frame */
    anim_tick(++frame);
    if (!demo_loaded) {
        demo_loaded = 1;
        demo_load();
    }
    switch (cmd) {
    case CMD_PING:
        resp[0] = demo_state;
        resp_len = 1;
        return 0;
    case CMD_ENTROPY:
        for (i = 0; i < len; i++) {
            n = demo_pool[i & 3] ^ data[i];
            demo_pool[i & 3] = (n << 3 | n >> 5) + 0x9D + i;
        }
        demo_pool[0] ^= DIV_REG;
        demo_reply(demo_pool, 4);
        return 0;
    case CMD_CREATE:
        if (demo_state != STATE_NONE) return 1;
        demo_think();
        demo_seeded = 1;
        demo_reply((const uint8_t *)DEMO_MNEMONIC, sizeof(DEMO_MNEMONIC) - 1);
        return 0;
    case CMD_WORDS:
        if (demo_state != STATE_NONE) return 1;
        /* only the demo phrase's words: enough to restore it */
        n = 0;
        resp_len = 1;
        for (i = 0; i < DEMO_WORD_COUNT && n < 4; i++) {
            if (len && !memcmp(demo_words[i], data, len)) {
                uint8_t l = strlen(demo_words[i]);
                resp[resp_len++] = demo_word_idx[i] >> 8;
                resp[resp_len++] = demo_word_idx[i] & 0xFF;
                memcpy(resp + resp_len, demo_words[i], l + 1);
                resp_len += l + 1;
                n++;
            }
        }
        resp[0] = n;
        return 0;
    case CMD_RESTORE:
        if (demo_state != STATE_NONE || len != 24) return 1;
        demo_think();
        if (memcmp(data, demo_phrase_idx, 24)) return 2;
        demo_seeded = 1;
        return 0;
    case CMD_SET_PIN:
        if (demo_state != STATE_NONE || !demo_seeded || len != 4) return 1;
        memcpy(demo_pin, data, 4);
        demo_tries = DEMO_TRIES;
        demo_state = STATE_UNLOCKED;
        demo_store();
        return 0;
    case CMD_UNLOCK:
        if (demo_state == STATE_NONE) return 3;
        /* spend the try before checking, so pulling the power can't undo a wrong guess */
        demo_tries--;
        demo_store();
        /* the PIN chosen at setup, or 0000 */
        if (!memcmp(data, demo_pin, 4) || !(data[0] | data[1] | data[2] | data[3])) {
            demo_tries = DEMO_TRIES;
            demo_state = STATE_UNLOCKED;
            demo_store();
            return 0;
        }
        if (demo_tries == 0) {
            demo_wipe();
            return 2;
        }
        resp[0] = demo_tries;
        resp_len = 1;
        return 1;
    case CMD_ACCOUNT:
        if (demo_state != STATE_UNLOCKED) return 1;
        if (arg == CHAIN_SOL) demo_reply(demo_account_sol, sizeof(demo_account_sol));
        else demo_reply(demo_account_evm[demo_net], demo_account_evm_len[demo_net]);
        return 0;
    case CMD_NETWORK:
        if (demo_state != STATE_UNLOCKED || (arg != 1 && arg != 2)) return 1;
        if (arg == 1) demo_net = demo_net + 1 == DEMO_NETS ? 0 : demo_net + 1;
        else demo_net = demo_net ? demo_net - 1 : DEMO_NETS - 1;
        return 0;
    case CMD_QR:
        if (demo_state != STATE_UNLOCKED) return 1;
        if (arg == CHAIN_SOL) demo_reply(demo_qr_sol, sizeof(demo_qr_sol));
        else demo_reply(demo_qr_evm, sizeof(demo_qr_evm));
        return 0;
    case CMD_PENDING:
        if (demo_state != STATE_UNLOCKED || !demo_pending) return 1;
        if (demo_pending == 1) demo_reply(demo_pending_sol, sizeof(demo_pending_sol));
        else demo_reply(demo_pending_evm, sizeof(demo_pending_evm));
        return 0;
    case CMD_SIGN:
        if (demo_state != STATE_UNLOCKED || !demo_pending) return 1;
        n = demo_pending;
        demo_pending = 0;
        if (arg != 1) return 0;
        demo_think();
        demo_tx_chain = n;
        demo_tx_polls = 0;
        return 0;
    case CMD_TXSTATUS:
        /* what the phone would report: signed, broadcast, then confirmed */
        if (!demo_tx_chain) {
            demo_reply_str("", "");
            return 0;
        }
        /* polled every half second: ~1.5 s signed, ~3 s broadcast, then confirmed */
        n = ++demo_tx_polls;
        if (n <= 3) demo_reply_str("SIGNED", "");
        else demo_reply_str(n <= 9 ? "BROADCAST" : "CONFIRMED", demo_tx_chain == 1 ? DEMO_SOL_HASH : DEMO_EVM_HASH);
        return 0;
    case CMD_LOCK:
        if (demo_state == STATE_UNLOCKED) demo_state = STATE_LOCKED;
        demo_pending = 0;
        return 0;
    case CMD_WIPE:
        demo_wipe();
        return 0;
    }
    return 0xFF;
}

/* every reply ends in a NUL at resp_len, like the real mailbox copy */
static uint8_t chip_call(uint8_t cmd, uint8_t arg, const uint8_t *data, uint8_t len) {
    uint8_t st = demo_call(cmd, arg, data, len);
    resp[resp_len] = 0;
    return st;
}

#define clear_req(len)

/* What the phone does in the demo: a held START on the home screen raises a
 * request, Solana first, then Ethereum, alternating. */
static void demo_raise(void) {
    if (demo_state != STATE_UNLOCKED || demo_pending) return;
    demo_pending = demo_next + 1;
    demo_next ^= 1;
}

/* No accelerometer: holding any button "shakes" the cartridge. */
static int8_t demo_accel(uint8_t keys) {
    if (!keys) return 0;
    return (int8_t)((uint8_t)(DIV_REG ^ (frame * 37)) % 25) - 12;
}

#define chip_present() 1
#define ACCEL_X() demo_accel(held_keys)
#define ACCEL_Y() demo_accel(held_keys)
#define TX_PENDING() (demo_state == STATE_UNLOCKED && demo_pending)
#define REQ_KIND() (TX_PENDING() ? 1 : 0) /* the demo phone is always paired */

#else

static uint8_t chip_call(uint8_t cmd, uint8_t arg, const uint8_t *data, uint8_t len) {
    uint8_t i;
    uint16_t waited = 0;
    for (i = 0; i < len; i++) MB[MB_REQ + i] = data[i];
    MB[MB_REQ_LEN] = len;
    MB[MB_ARG] = arg;
    MB[MB_CMD] = cmd;
    seq++;
    if (seq == 0) seq = 1;
    MB[MB_REQ_SEQ] = seq;
    while (MB[MB_RESP_SEQ] != seq) {
        vsync();
        anim_tick(++frame);
        if (++waited > 600) return ST_TIMEOUT;
    }
    resp_len = MB[MB_RESP_LEN];
    if (resp_len > RESP_MAX) resp_len = RESP_MAX;
    for (i = 0; i < resp_len; i++) resp[i] = MB[MB_RESP + i];
    resp[resp_len] = 0;
    return MB[MB_STATUS];
}

static uint8_t chip_present(void) {
    return MB[MB_MAGIC] == CHIP_MAGIC;
}

/* Scrub a secret request (PIN, word indices) from the mailbox once answered. */
static void clear_req(uint8_t len) {
    uint8_t i;
    for (i = 0; i < len; i++) MB[MB_REQ + i] = 0;
    MB[MB_REQ_LEN] = 0;
}

#define ACCEL_X() ((int8_t)MB[MB_ACCEL_X])
#define ACCEL_Y() ((int8_t)MB[MB_ACCEL_Y])
#define TX_PENDING() (MB[MB_PENDING])
#define REQ_KIND() (MB[MB_PENDING]) /* 1 sign request, 2 a phone asks to pair */
#endif

/* ---------- reading chip replies ---------- */

/* Every parse stays inside the reply: resp[resp_len] is always a NUL, and a
 * field cursor never moves past it, whatever counts or NULs the chip sends. */
#define RESP_END (resp + resp_len)

/* The field after the NUL-terminated one at s ("" when the reply runs out). */
static char *next_field(char *s) {
    while (s < RESP_END && *s) s++;
    return s < RESP_END ? s + 1 : RESP_END;
}

/* Drop a reply that held secrets (recovery words, word suggestions). */
static void forget_resp(void) {
    memset(resp, 0, sizeof(resp));
    resp_len = 0;
}

/* ---------- sound ---------- */

static void sound_init(void) {
    NR52_REG = 0x80;
    NR51_REG = 0x11;
    NR50_REG = 0x77;
}

/* short click; `pitch` is the low byte of a high-octave tone */
static void beep(uint8_t pitch) {
    NR10_REG = 0x00;
    NR11_REG = 0x80;
    NR12_REG = 0xA2;
    NR13_REG = pitch;
    NR14_REG = 0x87;
}

/* x = 2048 - 131072 / Hz */
#define NOTE_C6 1923
#define NOTE_E6 1949
#define NOTE_G6 1964
#define NOTE_C7 1985

static void tone(uint16_t x) {
    NR10_REG = 0x00;
    NR11_REG = 0x80;
    NR12_REG = 0xA3;
    NR13_REG = x & 0xFF;
    NR14_REG = 0x80 | (x >> 8);
}

static void wait_frames(uint8_t n) {
    while (n--) {
        vsync();
        anim_tick(++frame);
    }
}

static void chime(void) {
    tone(NOTE_E6);
    wait_frames(7);
    tone(NOTE_C7);
}

static void jingle_ok(void) {
    tone(NOTE_C6);
    wait_frames(5);
    tone(NOTE_E6);
    wait_frames(5);
    tone(NOTE_G6);
}

/* ---------- input ---------- */

/* The joypad is read once per frame in the VBlank interrupt and every new press
 * is queued as its own event, so presses made while the main loop is busy
 * (fades, redraws, waiting on the chip) are neither lost nor merged. */
#define QUEUE 16
static volatile uint8_t held_keys, press_div;
static volatile uint8_t q_keys[QUEUE];
static volatile uint8_t q_head, q_tail;

static void vbl_isr(void) {
    uint8_t k = joypad();
    uint8_t fresh = k & ~held_keys;
    uint8_t next;
    held_keys = k;
    if (!fresh) return;
    press_div = DIV_REG; /* the exact cycle of a human press is noisy */
    next = (q_head + 1) & (QUEUE - 1);
    if (next != q_tail) { /* full queue: drop the newest */
        q_keys[q_head] = fresh;
        q_head = next;
    }
}

/* The oldest unread press (0 if none). */
static uint8_t pressed(void) {
    uint8_t p = 0;
    disable_interrupts();
    if (q_tail != q_head) {
        p = q_keys[q_tail];
        q_tail = (q_tail + 1) & (QUEUE - 1);
    }
    enable_interrupts();
    return p;
}

/* Drop presses made before a screen that needs a deliberate answer. */
static void flush_input(void) {
    disable_interrupts();
    q_tail = q_head;
    enable_interrupts();
}

static uint8_t wait_press(void) {
    uint8_t p;
    do {
        vsync();
        anim_tick(++frame);
        p = pressed();
    } while (!p);
    beep(0xC0);
    return p;
}

static void wait_a(void) {
    flush_input();
    while (!(wait_press() & J_A)) {}
}

/* Polled once a frame by every idle screen of an unlocked wallet. */
static uint8_t request_waiting(void) {
#ifdef DEMO_CHIP
    /* the demo's stand-in for the phone: a held START raises a request */
    static uint8_t start_held;
    if (held_keys == J_START) {
        if (++start_held == 60) demo_raise();
    } else {
        start_held = 0;
    }
#endif
    return TX_PENDING() ? 1 : 0;
}

/* Like wait_press, but gives up with 0 as soon as a sign request arrives. */
static uint8_t wait_press_or_request(void) {
    uint8_t p;
    for (;;) {
        vsync();
        anim_tick(++frame);
        if (request_waiting()) return 0;
        p = pressed();
        if (p) break;
    }
    beep(0xC0);
    return p;
}

/* ---------- shared screens ---------- */

/* A centred icon, a title and up to two lines of explanation. */
static void message(uint8_t icon_first, const char *title, const char *l1, const char *l2) {
    screen_begin();
    icon(9, 4, icon_first);
    txtc(7, title);
    if (l1) capc(9, l1);
    if (l2) capc(10, l2);
}

static void fatal(const char *l1, const char *l2) {
    message(T_ICON_SHIELD_0, "Cartridge error", l1, l2);
    capc(15, "CHECK THE CARTRIDGE");
    screen_end();
    while (1) vsync();
}

static void expect_ok(uint8_t st) {
    if (st == ST_TIMEOUT) fatal("THE KEY CHIP IS", "NOT RESPONDING");
}

/* ---------- boot ---------- */

static void boot(void) {
    uint8_t i, y;
    gfx_load_logo();
    clear();
    for (y = 0; y < KEY_H; y++)
        for (i = 0; i < KEY_W; i++) put(8 + i, 2 + y, T_FONT_GREY + LOGO_KEY_FIRST + y * KEY_W + i);
    for (y = 0; y < LOGO_H; y++)
        for (i = 0; i < LOGO_W; i++) put(3 + i, 7 + y, T_FONT_GREY + y * LOGO_W + i);
    txtc(11, "hardware wallet");
    txtc(12, "solana + evm");

    /* the logo glides down into place while the screen fades up */
    SCY_REG = 40;
    fade_in();
    for (i = 40; i; i--) {
        SCY_REG = i - 1 - ((i - 1) * (i - 1)) / 80; /* ease out */
        vsync();
    }
    SCY_REG = 0;

    for (i = 0; i < 90 && !chip_present(); i++) wait_frames(1);
    if (!chip_present()) {
        gfx_load_captions();
        fatal("NO KEY CHIP", "DETECTED");
    }
    sound_init();
    chime();
    for (;;) {
        txtc(15, (frame & 32) ? "press start" : "           ");
        vsync();
        anim_tick(++frame);
        if (pressed() & J_START) break;
    }
    beep(0xE0);
    fade_out();
    gfx_load_captions();
}

/* ---------- new wallet: entropy ---------- */

static void flush_entropy(void) {
    if (!ent_len) return;
    expect_ok(chip_call(CMD_ENTROPY, 0, ent, ent_len));
    ent_len = 0;
}

static void add_entropy(uint8_t b) {
    ent[ent_len++] = b;
    if (ent_len == REQ_MAX) flush_entropy();
}

static void hex4(uint8_t y) {
    /* "POOL 3A BF 2D F6": the first 4 bytes of the entropy pool fingerprint */
    char b[17];
    uint8_t i, j = 5;
    memcpy(b, "POOL ", 5);
    for (i = 0; i < 4; i++) {
        b[j++] = "0123456789ABCDEF"[(uint8_t)resp[i] >> 4];
        b[j++] = "0123456789ABCDEF"[(uint8_t)resp[i] & 0xF];
        b[j++] = ' ';
    }
    b[16] = 0;
    capc(y, b);
}

#define MASH_TARGET 40

static void entropy_buttons(void) {
    uint8_t count = 0, p;
    screen_begin();
    header(T_ICON_KEY_0, "Make your keys", "STEP 1 OF 3");
    txtc(5, "Mash any buttons");
    txtc(6, "in a random rhythm");
    bar(2, 9, 14, 0, MASH_TARGET);
    big(8, 11, "0");
    cap(10, 12, "/40");
    screen_end();
    while (count < MASH_TARGET) {
        vsync();
        anim_tick(++frame);
        p = pressed();
        if (!p) continue;
        /* the exact cycle a human presses on is the noisy part */
        add_entropy(press_div);
        add_entropy(p ^ frame);
        count++;
        beep(0x80 + (DIV_REG & 0x3F));
        bar(2, 9, 14, count, MASH_TARGET);
        {
            char b[3];
            b[0] = count >= 10 ? '0' + count / 10 : ' ';
            b[1] = '0' + count % 10;
            b[2] = 0;
            big(8, 11, b[0] == ' ' ? b + 1 : b);
        }
    }
    flush_entropy();
    expect_ok(chip_call(CMD_ENTROPY, 0, ent, 0));
    hex4(14);
    jingle_ok();
    wait_frames(50);
}

#define SHAKE_TARGET 200

static void entropy_motion(void) {
    int8_t x, y, lx = 0, ly = 0;
    int8_t dx, dy;
    uint16_t energy = 0;
    screen_begin();
    header(T_ICON_SHAKE_0, "Now shake it", "STEP 2 OF 3");
    txtc(5, "Shake your Game Boy");
    txtc(6, "for a few seconds");
    icon(9, 9, T_ICON_SHAKE_0);
    bar(2, 12, 14, 0, SHAKE_TARGET);
    screen_end();
    while (energy < SHAKE_TARGET) {
        vsync();
        anim_tick(++frame);
        x = ACCEL_X();
        y = ACCEL_Y();
        dx = x - lx;
        dy = y - ly;
        lx = x;
        ly = y;
        if (dx < 0) dx = -dx;
        if (dy < 0) dy = -dy;
        if (dx + dy > 6) {
            energy += (dx + dy) >> 2;
            add_entropy((uint8_t)x ^ DIV_REG);
            add_entropy((uint8_t)y);
            SCX_REG = (frame & 2) ? 1 : 0; /* the screen jiggles with you */
        } else {
            SCX_REG = 0;
        }
        if ((frame & 3) == 0) bar(2, 12, 14, energy > SHAKE_TARGET ? SHAKE_TARGET : energy, SHAKE_TARGET);
    }
    SCX_REG = 0;
    flush_entropy();
    expect_ok(chip_call(CMD_ENTROPY, 0, ent, 0));
    hex4(14);
    jingle_ok();
    wait_frames(50);
}

static void show_words(void) {
    char *w = resp;
    uint8_t i, n;
    screen_begin();
    header(T_ICON_KEY_0, "Your backup", "IN THIS ORDER");
    for (i = 0; i < 12; i++) {
        uint8_t y = 4 + i;
        if (i < 9) {
            char d[2];
            d[0] = '1' + i;
            d[1] = 0;
            cap(6, y, d);
        } else {
            cap(5, y, i == 9 ? "10" : i == 10 ? "11" : "12");
        }
        n = 0;
        while (w[n] && w[n] != ' ') n++;
        txt_n(8, y, w, n);
        w += n;
        if (*w == ' ') w++;
    }
    hint(4, 17, BTN_A, "I WROTE THEM");
    screen_end();
    wait_a();
    forget_resp(); /* the words are on paper now, not in RAM */
}

/* ---------- PIN ---------- */

static void pin_draw_digit(uint8_t i) {
    char d[2];
    d[0] = '0' + pin[i];
    d[1] = 0;
    big(4 + i * 4, 7, d);
}

static void pin_entry(const char *title, const char *sub) {
    uint8_t pos = 0, i, p;
    for (i = 0; i < 4; i++) pin[i] = 0;
    screen_begin();
    header(T_ICON_LOCK_0, title, sub);
    for (i = 0; i < 4; i++) {
        box(3 + i * 4, 6, 3, 4);
        pin_draw_digit(i);
    }
    capc(13, "UP/DOWN  DIGIT");
    capc(14, "LEFT/RIGHT  MOVE");
    hint(6, 17, BTN_A, "CONFIRM");
    marker(4, 10);
    screen_end();
    for (;;) {
        p = wait_press();
        if (p & J_UP) pin[pos] = (pin[pos] + 1) % 10;
        if (p & J_DOWN) pin[pos] = (pin[pos] + 9) % 10;
        if ((p & J_LEFT) && pos) pos--;
        if ((p & J_RIGHT) && pos < 3) pos++;
        pin_draw_digit(pos);
        marker(4 + pos * 4, 10);
        if (p & J_A) return;
    }
}

/* ---------- restore from 12 words ---------- */

static uint8_t word_idx[24]; /* 12 big-endian word indices for CMD_RESTORE */

/* Returns 0 for "create new", 1 for "restore". */
static uint8_t start_menu(void) {
    uint8_t sel = 0, p;
    screen_begin();
    header(T_ICON_KEY_0, "Welcome", "NO WALLET YET");
    box(1, 5, 18, 4);
    txt(4, 6, "New wallet");
    cap(4, 7, "12 NEW WORDS");
    box(1, 10, 18, 4);
    txt(4, 11, "Restore");
    cap(4, 12, "FROM 12 WORDS");
    hint(1, 17, BTN_A, "SELECT");
    cursor(2, 6);
    screen_end();
    for (;;) {
        p = wait_press();
        if (p & (J_UP | J_DOWN)) {
            sel ^= 1;
            cursor(2, sel ? 11 : 6);
        }
        if (p & J_A) return sel;
    }
}

/* resp after CMD_WORDS: count, then per word a 2-byte index and the word, 0-terminated.
 * How many whole entries the reply really holds (at most 4, the rows on screen). */
static uint8_t words_count(void) {
    char *w = resp + 1;
    uint8_t n = 0, want = resp_len ? (uint8_t)resp[0] : 0;
    if (want > 4) want = 4;
    while (n < want && w + 2 < RESP_END && w[2]) {
        w = next_field(w + 2);
        n++;
    }
    return n;
}

/* Entry k (< words_count()). Never walks past the reply. */
static char *word_at(uint8_t k, uint16_t *index) {
    char *w = resp + 1;
    while (k-- && w + 2 < RESP_END) w = next_field(w + 2);
    if (w + 2 >= RESP_END) {
        *index = 0;
        return RESP_END;
    }
    *index = ((uint16_t)(uint8_t)w[0] << 8) | (uint8_t)w[1];
    return w + 2;
}

/* The letter being picked, drawn as an inverted block so it can't be read as
 * part of the word: tile T_PICK is rebuilt from the font for each letter. */
#define T_PICK ((uint8_t)(T_UI + N_UI))

static void pick_draw(uint8_t x, char c) {
    uint8_t tile[16], i;
    const uint8_t *g = font_ink_tiles + (uint16_t)((uint8_t)c - 32) * 16;
    for (i = 0; i < 16; i++) tile[i] = (uint8_t)~g[i];
    set_bkg_data(T_PICK, 1, tile);
    put(x, 5, T_PICK);
}

/* fresh = 1 fades in a new word; later letters redraw in place without a fade */
static void word_entry_draw(uint8_t n, const char *prefix, uint8_t len, uint8_t count, uint8_t fresh) {
    uint8_t k;
    uint16_t index;
    char sub[14];
    memcpy(sub, "WORD ", 5);
    k = 5;
    if (n + 1 >= 10) sub[k++] = '1';
    sub[k++] = '0' + (n + 1) % 10;
    memcpy(sub + k, " OF 12", 7);
    if (fresh) screen_begin();
    else {
        sprites_hide();
        clear_rows(4, 14);
    }
    header(T_ICON_KEY_0, "Restore", sub);
    box(1, 4, 18, 3);
    txt_n(3, 5, prefix, len);
    if (len == 0) {
        capc(9, "PICK A FIRST LETTER");
        capc(10, "THEN PRESS RIGHT");
    } else if (count == 0) {
        capc(9, "NO WORD STARTS");
        capc(10, "LIKE THAT");
    } else {
        for (k = 0; k < count; k++) txt(4, 8 + k * 2, word_at(k, &index));
        cursor(2, 8);
    }
    cap(1, 16, "UP/DN LETTER  R ADD");
    if (count && len) {
        hint(0, 17, BTN_A, "USE TOP WORD");
        hint(15, 17, BTN_B, "DEL");
    } else {
        hint(1, 17, BTN_B, len ? "DELETE" : n ? "PREVIOUS WORD" : "BACK");
    }
    if (fresh) screen_end();
}

/* Letter picker with suggestions from the chip. Returns 0 when B leaves an
 * empty word (back one word, or to the menu from the first).
 * UP/DOWN only redraw the one letter so fast presses aren't dropped. */
static uint8_t word_entry(uint8_t n) {
    char prefix[9];
    uint8_t len = 0, count = 0, p;
    char cur = 'a';
    uint16_t index;
    word_entry_draw(n, prefix, len, count, 1);
    for (;;) {
        pick_draw(3 + len, cur);
        if (!(count && len)) marker(3 + len, 6);
        p = wait_press();
        if (p & J_UP) cur = cur == 'z' ? 'a' : cur + 1;
        if (p & J_DOWN) cur = cur == 'a' ? 'z' : cur - 1;
        if ((p & J_RIGHT) && len < 8) {
            prefix[len++] = cur;
            cur = 'a';
            count = 0;
            if (chip_call(CMD_WORDS, 0, (uint8_t *)prefix, len) == 0) count = words_count();
            word_entry_draw(n, prefix, len, count, 0);
        } else if ((p & (J_LEFT | J_B)) && len) {
            /* LEFT steps back onto the letter, B deletes it */
            cur = (p & J_LEFT) ? prefix[len - 1] : 'a';
            len--;
            count = 0;
            if (len && chip_call(CMD_WORDS, 0, (uint8_t *)prefix, len) == 0) count = words_count();
            word_entry_draw(n, prefix, len, count, 0);
        } else if ((p & J_B) && !len) {
            return 0;
        }
        if ((p & J_A) && count && len) {
            word_at(0, &index);
            word_idx[n * 2] = index >> 8;
            word_idx[n * 2 + 1] = index & 0xFF;
            return 1;
        }
    }
}

/* Shown before word entry: this cartridge is for trying kagiboy out, so real
 * backup words must never be typed into it. Returns 1 on A, 0 on B (menu). */
static uint8_t restore_warning(void) {
    uint8_t p;
    message(T_ICON_SHIELD_0, "Test words only", "NEVER TYPE YOUR REAL", "12 WORDS INTO");
    capc(11, "THIS DEMO");
    hint(1, 17, BTN_A, "OK");
    hint(12, 17, BTN_B, "BACK");
    screen_end();
    flush_input(); /* the A that picked Restore must not also accept this */
    for (;;) {
        p = wait_press();
        if (p & J_A) return 1;
        if (p & J_B) return 0;
    }
}

/* Returns 1 when the chip accepted the words, 0 to go back to the menu. */
static uint8_t restore(void) {
    uint8_t n = 0, st;
    if (!restore_warning()) return 0;
    while (n < 12) {
        if (word_entry(n)) n++;
        else if (n) n--;
        else return 0;
    }
    message(T_ICON_KEY_0, "Checking words", "ONE MOMENT", 0);
    screen_end();
    st = chip_call(CMD_RESTORE, 0, word_idx, 24);
    /* the 24 bytes are the whole seed: gone from RAM and the mailbox */
    memset(word_idx, 0, sizeof(word_idx));
    clear_req(24);
    forget_resp();
    expect_ok(st);
    if (st == 0) return 1;
    message(T_ICON_SHIELD_0, "Words don't match", "ONE IS WRONG OR", "OUT OF ORDER");
    hint(4, 17, BTN_A, "START AGAIN");
    screen_end();
    wait_a();
    return 0;
}

/* The PIN leaves RAM and the mailbox as soon as the chip has answered. */
static void forget_pin(void) {
    memset(pin, 0, sizeof(pin));
    clear_req(4);
}

static void new_wallet(void) {
    uint8_t restored = 0, st;
    for (;;) {
        if (start_menu() == 1) {
            if (restore()) {
                restored = 1;
                break;
            }
            continue;
        }
        entropy_buttons();
        entropy_motion();
        message(T_ICON_KEY_0, "Making your keys", "IN THE SECURE CHIP", 0);
        screen_end();
        expect_ok(chip_call(CMD_CREATE, 0, 0, 0));
        show_words();
        break;
    }
    pin_entry("Choose a PIN", restored ? "WORDS ACCEPTED" : "STEP 3 OF 3");
    st = chip_call(CMD_SET_PIN, 0, pin, 4);
    forget_pin();
    expect_ok(st);
}

/* Returns 1 when unlocked, 0 when the chip wiped itself. */
static uint8_t unlock(void) {
    uint8_t st;
    for (;;) {
        pin_entry("Welcome back", "ENTER YOUR PIN");
        st = chip_call(CMD_UNLOCK, 0, pin, 4);
        forget_pin();
        expect_ok(st);
        if (st == 0) return 1;
        if (st == 2) {
            message(T_ICON_SHIELD_0, "Cartridge wiped", "TOO MANY WRONG PINS", "THE KEYS ARE GONE");
            hint(5, 17, BTN_A, "CONTINUE");
            screen_end();
            wait_a();
            return 0;
        }
        message(T_ICON_LOCK_0, "Wrong PIN", 0, 0);
        num(6, 9, (uint8_t)resp[0]);
        cap(8, 9, resp[0] == 1 ? "TRY LEFT" : "TRIES LEFT");
        hint(4, 17, BTN_A, "TRY AGAIN");
        screen_end();
        wait_a();
    }
}

/* ---------- home ---------- */

/* One account card (frame top at y, 6 rows): chain icon, network name, big balance and unit. */
/* last balance line drawn per chain; the 2 s refresh only repaints a box when it changed,
 * since clearing and redrawing an unchanged box shows as a blink */
static char shown_bal[2][24];
static char shown_name[2][14];

/* which of net_icon_tiles fits a network name (the chip only sends names from its allowlist) */
static uint8_t net_icon(const char *name) {
    switch (name[0]) {
    case 'B': return 1; /* Base */
    case 'A': return 2; /* Arbitrum */
    case 'H': return 3; /* HyperEVM */
    case 'R': return 4; /* Robinhood */
    default: return 0;  /* Ethereum */
    }
}

static void draw_account(uint8_t chain, uint8_t y) {
    char *bal, *unit;
    const char *name;
    uint8_t w, k = chain == CHAIN_SOL ? 0 : 1;
    if (chip_call(CMD_ACCOUNT, chain, 0, 0) != 0) return;
    bal = next_field(resp);
    /* third field: the network's name (the phone picks which EVM network to show) */
    name = next_field(bal);
    if (name >= RESP_END || !*name) {
        if (chain == CHAIN_SOL) name = "Solana";
        else name = "Ethereum";
    }
    if (!strncmp(shown_bal[k], bal, sizeof shown_bal[0] - 1) && !strncmp(shown_name[k], name, sizeof shown_name[0] - 1)) return;
    strncpy(shown_bal[k], bal, sizeof shown_bal[0] - 1);
    shown_bal[k][sizeof shown_bal[0] - 1] = 0;
    strncpy(shown_name[k], name, sizeof shown_name[0] - 1);
    shown_name[k][sizeof shown_name[0] - 1] = 0;
    unit = bal;
    while (*unit && *unit != ' ') unit++;
    fill_bkg_rect(2, y + 1, 16, 4, T_FONT_INK);
    if (chain == CHAIN_SOL) {
        icon(2, y + 1, T_ICON_SOL_0);
        txt_n(5, y + 1, shown_name[k], 12);
    } else {
        /* one EVM card, five networks: load this network's icon into the card's icon tiles */
        set_bkg_data(T_ICON_ETH_0, 4, net_icon_tiles + 64u * net_icon(shown_name[k]));
        icon(2, y + 1, T_ICON_ETH_0);
        txt_n(5, y + 1, shown_name[k], 10);
        cap(16, y + 1, "<>"); /* LEFT/RIGHT switches the network */
    }
    w = big_width(bal);
    if (w > 11) w = 11;
    big(2, y + 3, bal);
    if (*unit) cap(3 + w, y + 4, unit + 1);
}

static void home_draw(void) {
    screen_begin();
    header(T_ICON_KEY_0, "kagiboy", "UNLOCKED");
    icon(17, 1, T_ICON_PHONE_0);
    box(1, 4, 18, 6);
    box(1, 10, 18, 6);
    shown_bal[0][0] = shown_bal[1][0] = 0x7F; /* never a real balance: force a full draw */
    shown_bal[0][1] = shown_bal[1][1] = 0;
    draw_account(CHAIN_SOL, 4);
    draw_account(CHAIN_EVM, 10);
    hint(1, 17, BTN_A, "RECEIVE");
    hint(11, 17, BTN_SEL, "MENU");
    screen_end();
}

/* ---------- QR codes ---------- */

/* 16 tiles, one for each 2x2 block of QR modules (bit 3 = top-left .. bit 0 = bottom-right). */
static uint8_t qr_tiles_ready;

static void qr_load_tiles(void) {
    uint8_t t, r, b, l, rt;
    uint8_t tile[16];
    for (t = 0; t < 16; t++) {
        for (r = 0; r < 8; r++) {
            l = r < 4 ? (t & 8) : (t & 2);
            rt = r < 4 ? (t & 4) : (t & 1);
            b = (l ? 0xF0 : 0) | (rt ? 0x0F : 0);
            tile[r * 2] = b; /* both bitplanes set = darkest shade */
            tile[r * 2 + 1] = b;
        }
        set_bkg_data(T_QR + t, 1, tile);
    }
    qr_tiles_ready = 1;
}

/* resp holds: size, then size*size bits row by row */
static uint8_t qr_dark(uint8_t r, uint8_t c) {
    uint8_t n = (uint8_t)resp[0];
    uint16_t i;
    if (r >= n || c >= n) return 0;
    i = (uint16_t)r * n + c;
    if (1 + (i >> 3) >= resp_len) return 0; /* short reply: never read past it */
    return ((uint8_t)resp[1 + (i >> 3)] >> (7 - (i & 7))) & 1;
}

/* 29 modules -> 15x15 tiles at 4px per module. The light screen around it is the quiet zone. */
static void qr_draw(uint8_t x0, uint8_t y0) {
    uint8_t tx, ty, r, c;
    uint8_t row[15];
    if (!qr_tiles_ready) qr_load_tiles();
    for (ty = 0; ty < 15; ty++) {
        r = ty * 2;
        for (tx = 0; tx < 15; tx++) {
            c = tx * 2;
            row[tx] = T_QR | (qr_dark(r, c) << 3) | (qr_dark(r, c + 1) << 2) | (qr_dark(r + 1, c) << 1) |
                      qr_dark(r + 1, c + 1);
        }
        set_bkg_tiles(x0, y0 + ty, 15, 1, row);
    }
}

static void sign_request(void);

/* Returns 1 when a sign request cut in (it has been handled; go home). */
static uint8_t receive(void) {
    uint8_t chain = CHAIN_SOL, as_text = 0, p;
    for (;;) {
        screen_begin();
        if (as_text) {
            cap(0, 0, "<");
            txtc(0, chain == CHAIN_SOL ? "Solana" : "EVM");
            cap(19, 0, ">");
            rule(1);
            capc(3, chain == CHAIN_SOL ? "YOUR ADDRESS" : "ANY EVM NETWORK");
            box(1, 5, 18, 5);
            if (chip_call(CMD_ACCOUNT, chain, 0, 0) == 0) wrap(2, 6, 16, resp, 3);
            capc(12, "SEND TESTNET FUNDS");
            capc(13, "ONLY");
            hint(1, 17, BTN_SEL, "QR CODE");
            hint(13, 17, BTN_B, "BACK");
        } else {
            /* rows 1 and 17 stay blank in QR view: phone cameras need a quiet
             * zone, so the title moves left to make room for the B hint */
            cap(0, 0, "<");
            cap(txt(2, 0, chain == CHAIN_SOL ? "Solana" : "EVM") + 3, 0, ">");
            hint(14, 0, BTN_B, "BACK");
            if (chip_call(CMD_QR, chain, 0, 0) == 0) qr_draw(2, 2);
        }
        screen_end();
        do {
            p = wait_press_or_request();
            if (!p) {
                sign_request();
                return 1;
            }
        } while (!(p & (J_LEFT | J_RIGHT | J_SELECT | J_B)));
        if (p & J_B) return 0;
        if (p & (J_LEFT | J_RIGHT)) chain ^= 1;
        if (p & J_SELECT) as_text ^= 1;
    }
}

/* ---------- signing ---------- */

static void tx_result(void) {
    char *detail;
    uint8_t ticks = 0, failed;
    message(T_ICON_CHECK_0, "Signed", "SENT TO YOUR PHONE", 0);
    screen_end();
    jingle_ok();
    for (;;) {
        if (chip_call(CMD_TXSTATUS, 0, 0, 0) == 0) {
            detail = next_field(resp);
            failed = !strcmp(resp, "FAILED") || !strcmp(resp, "UNKNOWN");
            if (failed) {
                /* not a success: swap the check and "Signed" for a neutral state */
                fill_bkg_rect(0, 4, SCREEN_W, 6, T_FONT_INK);
                icon(9, 4, T_ICON_PHONE_0); /* the phone's report, no check mark */
                txtc(7, resp[0] == 'F' ? "Transaction failed" : "Status unknown");
                capc(9, "REPORTED BY PHONE");
            }
            clear_rows(11, 4);
            capc(11, resp);
            /* on failure the chip sends a reason instead of a signature */
            if (*detail) wrap(1, 13, 18, detail, 2);
            if (failed || !strcmp(resp, "CONFIRMED")) break;
        }
        wait_frames(30);
        if (++ticks > 120) {
            capc(15, "STILL CONFIRMING,");
            capc(16, "CHECK YOUR PHONE");
            break;
        }
    }
    hint(7, 17, BTN_A, "DONE");
    wait_a();
}

/* A phone asks to pair. Both screens show the same code (Bluetooth numeric comparison); only the
 * owner, holding the Game Boy, can let a new phone in. */
static void pair_request(void) {
    uint8_t p, st;
    if (chip_call(CMD_PAIR, 0, 0, 0) != 0) return;
    beep(0xF0);
    screen_begin();
    header(T_ICON_PHONE_0, "Pair phone?", "NEW PHONE");
    capc(5, "CHECK YOUR PHONE");
    box(5, 7, 10, 4);
    big(7, 8, resp); /* 6 digits */
    capc(13, "SAME CODE THERE?");
    capc(14, "THEN PRESS A");
    hint(1, 17, BTN_A, "PAIR");
    hint(13, 17, BTN_B, "NO");
    screen_end();
    while (held_keys) vsync();
    flush_input();
    do {
        p = wait_press();
    } while (!(p & (J_A | J_B)));
    if (p & J_A) {
        st = chip_call(CMD_PAIR, 1, 0, 0);
        if (st == 0) message(T_ICON_CHECK_0, "Paired", "THIS PHONE CAN NOW", "ASK YOU TO SIGN");
        else message(T_ICON_PHONE_0, "Expired", "ASK AGAIN FROM", "THE PHONE");
    } else {
        chip_call(CMD_PAIR, 2, 0, 0);
        message(T_ICON_SHIELD_0, "Not paired", "THE PHONE WAS", "TURNED AWAY");
    }
    screen_end();
    wait_frames(90);
}

static void sign_request(void) {
    uint8_t held = 0, shown = 0, k, st, w;
    uint16_t hold_start = 0, elapsed;
    char *to, *amount, *fee, *network, *unit;
    /* every interrupted screen lands here; a pairing is the other kind of request */
    if (REQ_KIND() == 2) {
        pair_request();
        return;
    }
    if (chip_call(CMD_PENDING, 0, 0, 0) != 0) return;
    /* every field below was decoded and written by the chip, not the phone;
     * the cursor stops at the end of the reply, so a malformed one shows blanks */
    to = resp_len ? resp + 1 : RESP_END;
    amount = next_field(to);
    fee = next_field(amount);
    network = next_field(fee);
    beep(0xF0);
    screen_begin();
    header(T_ICON_SHIELD_0, "Approve?", network);
    cap(1, 4, "SEND");
    w = big_width(amount);
    if (w <= 14) {
        big(1, 5, amount);
        unit = amount + w;
        if (*unit) txt(2 + w, 6, unit + 1);
    } else {
        wrap(1, 5, 18, amount, 2);
    }
    cap(1, 7, "FEE");
    txt_n(2, 8, fee, 16);
    cap(1, 9, "TO");
    box(1, 10, 18, 5);
    wrap(2, 11, 16, to, 3);
    bar(2, 16, 14, 0, 60);
    hint(0, 17, BTN_A, "HOLD TO SIGN");
    hint(15, 17, BTN_B, "NO");
    screen_end();
    /* arm only once every button is up, so a press left over from the
     * previous screen can neither reject nor start approving */
    while (held_keys) vsync();
    flush_input();
    for (;;) {
        vsync();
        anim_tick(++frame);
        k = held_keys;
        if (k & J_B) {
            beep(0x40);
            chip_call(CMD_SIGN, 0, 0, 0);
            message(T_ICON_SHIELD_0, "Rejected", "NOTHING WAS SIGNED", 0);
            screen_end();
            wait_frames(90);
            return;
        }
        if (k & J_A) {
            /* one second of real time, however long the drawing takes */
            if (!held) {
                held = 1;
                hold_start = sys_time;
            }
            elapsed = sys_time - hold_start;
            if (elapsed >= 60) break;
            if ((uint8_t)(elapsed >> 1) != shown) {
                shown = (uint8_t)(elapsed >> 1);
                if ((shown & 3) == 0) beep(0x90 + (uint8_t)elapsed);
                bar(2, 16, 14, elapsed, 60);
            }
        } else if (held) {
            held = 0;
            shown = 0;
            bar(2, 16, 14, 0, 60);
        }
    }
    bar(2, 16, 14, 60, 60);
    flush_input(); /* the A that was held to sign must not answer the next screen */
    beep(0xF8);
    message(T_ICON_KEY_0, "Signing", "IN THE SECURE CHIP", 0);
    screen_end();
    st = chip_call(CMD_SIGN, 1, 0, 0);
    if (st == ST_TIMEOUT) {
        /* the chip may still finish and hand the signature to the phone */
        message(T_ICON_PHONE_0, "No answer", "NO REPLY FROM CHIP", "CHECK YOUR PHONE");
        hint(7, 17, BTN_A, "OK");
        screen_end();
        wait_a();
        return;
    }
    if (st != 0) {
        message(T_ICON_SHIELD_0, "Not signed", "THE CHIP COULD NOT", "SIGN THIS REQUEST");
        hint(7, 17, BTN_A, "OK");
        screen_end();
        wait_a();
        return;
    }
    tx_result();
}

/* ---------- menu ---------- */

/* Returns 1 to re-lock, 2 after a wipe, 0 to go home (also after a sign
 * request cut in). */
static uint8_t menu(void) {
    uint8_t sel = 0, p, i;
    static const char *const items[] = {"Receive", "Lock", "Wipe cartridge", "Back"};
    for (;;) {
        screen_begin();
        header(T_ICON_KEY_0, "Menu", 0);
        for (i = 0; i < 4; i++) txt(4, 5 + i * 2, items[i]);
        hint(1, 17, BTN_A, "SELECT");
        hint(12, 17, BTN_B, "BACK");
        cursor(2, 5 + sel * 2);
        screen_end();
        for (;;) {
            p = wait_press_or_request();
            if (!p) {
                sign_request();
                return 0;
            }
            if ((p & J_UP) && sel) sel--;
            if ((p & J_DOWN) && sel < 3) sel++;
            cursor(2, 5 + sel * 2);
            if (p & (J_A | J_B)) break;
        }
        if (p & J_B) return 0;
        if (sel == 0 && receive()) return 0;
        if (sel == 1) {
            chip_call(CMD_LOCK, 0, 0, 0);
            return 1;
        }
        if (sel == 2) {
            message(T_ICON_SHIELD_0, "Wipe cartridge?", "ERASES THE KEYS", "ONLY 12 WORDS REMAIN");
            hint(1, 16, BTN_SEL, "+ A  WIPE");
            hint(1, 17, BTN_B, "CANCEL");
            screen_end();
            for (;;) {
                vsync();
                anim_tick(++frame);
                if (request_waiting()) {
                    sign_request();
                    return 0;
                }
                p = held_keys;
                if ((p & (J_SELECT | J_A)) == (J_SELECT | J_A)) {
                    chip_call(CMD_WIPE, 0, 0, 0);
                    /* the SELECT and A just pressed must not pick "New wallet" */
                    flush_input();
                    beep(0x40);
                    message(T_ICON_SHIELD_0, "Cartridge wiped", "THE KEYS ARE GONE", "12 WORDS RESTORE IT");
                    hint(5, 17, BTN_A, "CONTINUE");
                    screen_end();
                    wait_a();
                    return 2;
                }
                if (p & J_B) break;
            }
            /* B cancels back to this menu: its queued press must not also leave it */
            beep(0xC0);
            flush_input();
        }
        if (sel == 3) return 0;
    }
}

static void home(void) {
    uint8_t p, r;
    uint16_t refresh = 0;
    home_draw();
    for (;;) {
        vsync();
        anim_tick(++frame);
        if (request_waiting()) {
            sign_request();
            home_draw();
            refresh = 0;
            continue;
        }
        p = pressed();
        if (p & J_A) {
            beep(0xC0);
            receive();
            home_draw();
        } else if (p & J_SELECT) {
            beep(0xC0);
            r = menu();
            if (r) return;
            home_draw();
        } else if (p & (J_LEFT | J_RIGHT)) {
            /* the Game Boy decides which EVM network its second card shows; the phone follows */
            beep(0xB0);
            if (chip_call(CMD_NETWORK, (p & J_RIGHT) ? 1 : 2, 0, 0) == 0) draw_account(CHAIN_EVM, 10);
        }
        if (++refresh >= 120) {
            refresh = 0;
            draw_account(CHAIN_SOL, 4);
            draw_account(CHAIN_EVM, 10);
        }
    }
}

void main(void) {
    uint8_t st;
    DISPLAY_ON;
    gfx_init();
    disable_interrupts();
    add_VBL(vbl_isr);
    enable_interrupts();
    boot();
    for (;;) {
        st = chip_call(CMD_PING, 0, 0, 0);
        expect_ok(st);
        if (resp[0] == STATE_NONE) {
            new_wallet();
        } else if (resp[0] == STATE_LOCKED) {
            if (!unlock()) continue;
        }
        home();
    }
}
