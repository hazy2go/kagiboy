/*
 * Game Boy side of the wallet. This ROM is only the trusted screen and
 * buttons: it never sees a private key. Everything secret lives in the
 * cartridge chip, reached through the mailbox described in docs/protocol.md.
 */
#include <gb/gb.h>
#include <gbdk/console.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "brand.h"

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
        frame++;
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

/* ---------- sound ---------- */

static void sound_init(void) {
    NR52_REG = 0x80;
    NR51_REG = 0x11;
    NR50_REG = 0x77;
}

static void beep(uint8_t pitch) {
    NR10_REG = 0x00;
    NR11_REG = 0x80;
    NR12_REG = 0xA2;
    NR13_REG = pitch;
    NR14_REG = 0x87;
}

/* ---------- drawing ---------- */

static void wait_frames(uint8_t n) {
    while (n--) { vsync(); frame++; }
}

static void at(uint8_t x, uint8_t y, const char *s) {
    gotoxy(x, y);
    printf("%s", s);
}

static void center(uint8_t y, const char *s) {
    uint8_t n = (uint8_t)strlen(s);
    at(n < 20 ? (20 - n) / 2 : 0, y, s);
}

static void clear_row(uint8_t y) {
    at(0, y, y == 17 ? "                   " : "                    ");
}

static void header(const char *title) {
    cls();
    at(0, 0, title);
    at(0, 1, "====================");
}

/* Prints s wrapped to width w from (x, y), at most `rows` rows (the rest is cut). */
static void wrap_n(uint8_t x, uint8_t y, uint8_t w, const char *s, uint8_t rows) {
    uint8_t c = 0;
    gotoxy(x, y);
    while (*s && rows) {
        if (c == w) {
            c = 0;
            y++;
            if (!--rows) break;
            gotoxy(x, y);
        }
        putchar(*s++);
        c++;
    }
}

static void wrap(uint8_t x, uint8_t y, uint8_t w, const char *s) {
    wrap_n(x, y, w, s, 4);
}

/* "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" -> "7xKXtg..JosgAsU" */
static void short_addr(uint8_t x, uint8_t y, const char *a) {
    uint8_t n = (uint8_t)strlen(a), i;
    gotoxy(x, y);
    if (n <= 17) {
        printf("%s", a);
        return;
    }
    for (i = 0; i < 7; i++) putchar(a[i]);
    printf("..%s", a + n - 8);
}

static void bar(uint8_t y, uint8_t filled, uint8_t total) {
    uint8_t i;
    gotoxy(1, y);
    putchar('[');
    for (i = 0; i < 16; i++) putchar(i < (uint16_t)filled * 16 / total ? '#' : '.');
    putchar(']');
}

static void hex2(uint8_t v) {
    putchar("0123456789ABCDEF"[v >> 4]);
    putchar("0123456789ABCDEF"[v & 0xF]);
}

/* ---------- input ---------- */

/* The joypad is read once per frame in the VBlank interrupt, so a press can't be
 * lost while the main loop is busy redrawing or waiting on the chip. */
static volatile uint8_t held_keys, latched_keys, press_div;

static void vbl_isr(void) {
    uint8_t k = joypad();
    uint8_t fresh = k & ~held_keys;
    if (fresh) press_div = DIV_REG; /* the exact cycle of a human press is noisy */
    latched_keys |= fresh;
    held_keys = k;
}

/* Buttons pressed since the last call. */
static uint8_t pressed(void) {
    uint8_t p;
    disable_interrupts();
    p = latched_keys;
    latched_keys = 0;
    enable_interrupts();
    return p;
}

/* Drop presses made before a screen that needs a deliberate answer. */
static void flush_input(void) {
    pressed();
}

static uint8_t wait_press(void) {
    uint8_t p;
    do {
        vsync();
        frame++;
        p = pressed();
    } while (!p);
    beep(0xC0);
    return p;
}

static void fatal(const char *line1, const char *line2) {
    header("  CARTRIDGE ERROR");
    center(7, line1);
    center(9, line2);
    center(15, "CHECK CARTRIDGE");
    while (1) vsync();
}

static void expect_ok(uint8_t st) {
    if (st == ST_TIMEOUT) fatal("CHIP NOT", "RESPONDING");
}

/* ---------- screens ---------- */

static void boot(void) {
    uint8_t i;
    cls();
    center(4, BRAND_NAME);
    center(5, "--------------");
    center(7, "HARDWARE WALLET");
    center(9, "SOLANA + EVM");
    for (i = 0; i < 90 && !chip_present(); i++) wait_frames(1);
    if (!chip_present()) fatal("NO KEY CHIP", "DETECTED");
    center(12, "KEY CHIP: OK");
    sound_init();
    beep(0xD0);
    for (;;) {
        center(15, (frame & 32) ? "PRESS START" : "           ");
        vsync();
        frame++;
        if (pressed() & J_START) break;
    }
    beep(0xE0);
}

static void flush_entropy(void) {
    if (!ent_len) return;
    expect_ok(chip_call(CMD_ENTROPY, 0, ent, ent_len));
    ent_len = 0;
}

static void add_entropy(uint8_t b) {
    ent[ent_len++] = b;
    if (ent_len == REQ_MAX) flush_entropy();
}

static void show_pool(uint8_t y) {
    uint8_t i;
    gotoxy(2, y);
    printf("POOL ");
    for (i = 0; i < 4; i++) {
        hex2((uint8_t)resp[i]);
        putchar(i < 3 ? ' ' : ' ');
    }
}

#define MASH_TARGET 40

static void entropy_buttons(void) {
    uint8_t count = 0, p;
    header("NEW WALLET  1/3");
    center(3, "MASH ANY BUTTONS");
    center(4, "AS RANDOMLY AS YOU");
    center(5, "CAN!");
    bar(8, 0, MASH_TARGET);
    while (count < MASH_TARGET) {
        vsync();
        frame++;
        p = pressed();
        if (!p) continue;
        /* the exact cycle a human presses on is the noisy part */
        add_entropy(press_div);
        add_entropy(p ^ frame);
        count++;
        beep(0x80 + (DIV_REG & 0x3F));
        bar(8, count, MASH_TARGET);
        gotoxy(2, 10);
        printf("PRESSES %u/%u ", (uint16_t)count, (uint16_t)MASH_TARGET);
    }
    flush_entropy();
    expect_ok(chip_call(CMD_ENTROPY, 0, ent, 0));
    show_pool(12);
    center(16, "NICE!");
    wait_frames(60);
}

#define SHAKE_TARGET 200

static void entropy_motion(void) {
    int8_t x, y, lx = 0, ly = 0;
    int8_t dx, dy;
    uint16_t energy = 0;
    header("NEW WALLET  2/3");
    center(3, "NOW SHAKE YOUR");
    center(4, "GAME BOY!");
    bar(8, 0, SHAKE_TARGET);
    while (energy < SHAKE_TARGET) {
        vsync();
        frame++;
        x = (int8_t)MB[MB_ACCEL_X];
        y = (int8_t)MB[MB_ACCEL_Y];
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
        }
        if ((frame & 3) == 0) {
            bar(8, energy > SHAKE_TARGET ? SHAKE_TARGET : energy, SHAKE_TARGET);
            gotoxy(3, 10);
            printf("X:%d  Y:%d   ", (int16_t)x, (int16_t)y);
        }
    }
    flush_entropy();
    expect_ok(chip_call(CMD_ENTROPY, 0, ent, 0));
    show_pool(12);
    center(16, "GOOD SHAKE!");
    wait_frames(60);
}

static void show_words(void) {
    char *w = resp;
    uint8_t i;
    header("WRITE THESE DOWN");
    for (i = 0; i < 12; i++) {
        gotoxy(2, 3 + i);
        if (i < 9) putchar(' ');
        printf("%u. ", (uint16_t)(i + 1));
        while (*w && *w != ' ') putchar(*w++);
        if (*w == ' ') w++;
    }
    center(16, "NEVER TYPE THEM IN");
    center(17, "A: I WROTE THEM");
    while (!(wait_press() & J_A)) {}
}

static void pin_entry(const char *title, const char *prompt) {
    uint8_t pos = 0, i, p;
    for (i = 0; i < 4; i++) pin[i] = 0;
    header(title);
    center(4, prompt);
    center(14, "UP/DOWN: DIGIT");
    center(15, "LEFT/RIGHT: MOVE");
    center(16, "A: CONFIRM");
    for (;;) {
        for (i = 0; i < 4; i++) {
            gotoxy(6 + i * 2, 8);
            putchar('0' + pin[i]);
            gotoxy(6 + i * 2, 9);
            putchar(i == pos ? '^' : ' ');
        }
        p = wait_press();
        if (p & J_UP) pin[pos] = (pin[pos] + 1) % 10;
        if (p & J_DOWN) pin[pos] = (pin[pos] + 9) % 10;
        if ((p & J_LEFT) && pos) pos--;
        if ((p & J_RIGHT) && pos < 3) pos++;
        if (p & J_A) return;
    }
}

/* ---------- restore from 12 words ---------- */

static uint8_t word_idx[24]; /* 12 big-endian word indices for CMD_RESTORE */

/* Returns 0 for "create new", 1 for "restore". */
static uint8_t start_menu(void) {
    uint8_t sel = 0, p;
    for (;;) {
        header("NEW CARTRIDGE");
        center(4, "NO WALLET ON THIS");
        center(5, "CARTRIDGE YET");
        at(1, 9, sel == 0 ? ">" : " ");
        at(3, 9, "CREATE NEW WALLET");
        at(1, 11, sel == 1 ? ">" : " ");
        at(3, 11, "RESTORE 12 WORDS");
        at(0, 17, "UP/DOWN  A:SELECT");
        p = wait_press();
        if (p & (J_UP | J_DOWN)) sel ^= 1;
        if (p & J_A) return sel;
    }
}

/* resp after CMD_WORDS: count, then per word a 2-byte index and the word, 0-terminated */
static char *word_at(uint8_t k, uint16_t *index) {
    char *w = resp + 1;
    while (k--) w += 2 + strlen(w + 2) + 1;
    *index = ((uint16_t)(uint8_t)w[0] << 8) | (uint8_t)w[1];
    return w + 2;
}

static void word_entry_draw(uint8_t n, const char *prefix, uint8_t len, uint8_t count) {
    uint8_t k;
    uint16_t index;
    header("RESTORE");
    gotoxy(12, 0);
    printf("WORD %u", (uint16_t)(n + 1));
    gotoxy(1, 3);
    for (k = 0; k < len; k++) putchar(prefix[k]);
    gotoxy(1 + len, 4);
    putchar('^');
    if (len == 0) {
        center(7, "PICK THE FIRST");
        center(8, "LETTER, THEN RIGHT");
    } else if (count == 0) {
        center(7, "NO WORD STARTS");
        center(8, "LIKE THAT");
    } else {
        for (k = 0; k < count; k++) {
            at(2, 6 + k * 2, k == 0 ? ">" : " ");
            at(4, 6 + k * 2, word_at(k, &index));
        }
    }
    at(0, 15, "UP/DN:LETTER R:ADD");
    at(0, 16, "LEFT:DELETE");
    at(0, 17, count && len ? "A:USE TOP WORD" : "B:CANCEL");
}

/* Letter picker with suggestions from the chip. Returns 0 if cancelled.
 * UP/DOWN only redraw the one letter so fast presses aren't dropped. */
static uint8_t word_entry(uint8_t n) {
    char prefix[9];
    uint8_t len = 0, count = 0, p;
    char cur = 'a';
    uint16_t index;
    word_entry_draw(n, prefix, len, count);
    for (;;) {
        gotoxy(1 + len, 3);
        putchar(cur);
        p = wait_press();
        if (p & J_UP) cur = cur == 'z' ? 'a' : cur + 1;
        if (p & J_DOWN) cur = cur == 'a' ? 'z' : cur - 1;
        if ((p & J_RIGHT) && len < 8) {
            prefix[len++] = cur;
            cur = 'a';
            count = 0;
            if (chip_call(CMD_WORDS, 0, (uint8_t *)prefix, len) == 0) count = (uint8_t)resp[0];
            word_entry_draw(n, prefix, len, count);
        }
        if ((p & J_LEFT) && len) {
            cur = prefix[--len];
            count = 0;
            if (len && chip_call(CMD_WORDS, 0, (uint8_t *)prefix, len) == 0) count = (uint8_t)resp[0];
            word_entry_draw(n, prefix, len, count);
        }
        if ((p & J_A) && count && len) {
            word_at(0, &index);
            word_idx[n * 2] = index >> 8;
            word_idx[n * 2 + 1] = index & 0xFF;
            return 1;
        }
        if ((p & J_B) && !len) return 0;
    }
}

/* Returns 1 when the chip accepted the words, 0 to go back to the menu. */
static uint8_t restore(void) {
    uint8_t n, st;
    for (n = 0; n < 12; n++) {
        if (!word_entry(n)) return 0;
    }
    header("RESTORE");
    center(8, "CHECKING WORDS...");
    st = chip_call(CMD_RESTORE, 0, word_idx, 24);
    expect_ok(st);
    if (st == 0) return 1;
    header("WORDS DON'T MATCH");
    center(6, "ONE OF THE WORDS");
    center(7, "IS WRONG OR IN THE");
    center(8, "WRONG ORDER");
    center(16, "A: START AGAIN");
    while (!(wait_press() & J_A)) {}
    return 0;
}

static void new_wallet(void) {
    for (;;) {
        if (start_menu() == 1) {
            if (restore()) break;
            continue;
        }
        entropy_buttons();
        entropy_motion();
        header("NEW WALLET");
        center(8, "GENERATING KEYS");
        center(9, "IN SECURE CHIP...");
        expect_ok(chip_call(CMD_CREATE, 0, 0, 0));
        show_words();
        break;
    }
    pin_entry("SET PIN", "CHOOSE A 4-DIGIT PIN");
    expect_ok(chip_call(CMD_SET_PIN, 0, pin, 4));
}

/* Returns 1 when unlocked, 0 when the chip wiped itself. */
static uint8_t unlock(void) {
    uint8_t st;
    for (;;) {
        pin_entry("LOCKED", "ENTER YOUR PIN");
        st = chip_call(CMD_UNLOCK, 0, pin, 4);
        expect_ok(st);
        if (st == 0) return 1;
        if (st == 2) {
            header("WIPED");
            center(7, "TOO MANY WRONG PINS");
            center(9, "KEYS ERASED");
            center(16, "A: CONTINUE");
            while (!(wait_press() & J_A)) {}
            return 0;
        }
        header("WRONG PIN");
        gotoxy(3, 8);
        printf("%u TRIES LEFT", (uint16_t)(uint8_t)resp[0]);
        center(16, "A: TRY AGAIN");
        while (!(wait_press() & J_A)) {}
    }
}

static void draw_account(uint8_t chain, uint8_t y) {
    char *bal;
    if (chip_call(CMD_ACCOUNT, chain, 0, 0) != 0) return;
    bal = resp + strlen(resp) + 1;
    short_addr(1, y, resp);
    clear_row(y + 1);
    wrap_n(1, y + 1, 18, bal, 1);
}

static void home_draw(void) {
    header(BRAND_NAME);
    at(0, 3, "SOLANA");
    at(0, 7, "ETHEREUM");
    draw_account(CHAIN_SOL, 4);
    draw_account(CHAIN_EVM, 8);
    at(0, 15, "A:RECEIVE SEL:MENU");
    at(0, 16, "WAITING FOR PHONE..");
}

/* ---------- QR codes ---------- */

/* 16 tiles, one for each 2x2 block of QR modules (bit 3 = top-left .. bit 0 = bottom-right).
 * They sit at the top of tile memory, past the ASCII font. */
#define QR_TILE0 0xF0
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
        set_bkg_data(QR_TILE0 + t, 1, tile);
    }
    qr_tiles_ready = 1;
}

/* resp holds: size, then size*size bits row by row */
static uint8_t qr_dark(uint8_t r, uint8_t c) {
    uint8_t n = (uint8_t)resp[0];
    uint16_t i;
    if (r >= n || c >= n) return 0;
    i = (uint16_t)r * n + c;
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
            row[tx] = QR_TILE0 | (qr_dark(r, c) << 3) | (qr_dark(r, c + 1) << 2) | (qr_dark(r + 1, c) << 1) |
                      qr_dark(r + 1, c + 1);
        }
        set_bkg_tiles(x0, y0 + ty, 15, 1, row);
    }
}

static void receive(void) {
    uint8_t chain = CHAIN_SOL, as_text = 0, p;
    for (;;) {
        cls();
        /* rows 1 and 17 stay blank in QR view: phone cameras need a quiet zone */
        at(0, 0, chain == CHAIN_SOL ? "< SOLANA >" : "<  ETH   >");
        at(12, 0, as_text ? "SEL:QR" : "SEL:TEXT");
        if (as_text) {
            at(0, 1, "====================");
            at(1, 3, chain == CHAIN_SOL ? "SOLANA DEVNET" : "ETHEREUM SEPOLIA");
            if (chip_call(CMD_ACCOUNT, chain, 0, 0) == 0) wrap(1, 5, 18, resp);
            center(11, "SEND ONLY TESTNET");
            center(12, "FUNDS TO THIS");
            at(0, 17, "B: BACK");
        } else if (chip_call(CMD_QR, chain, 0, 0) == 0) {
            qr_draw(2, 2);
        }
        p = wait_press();
        if (p & (J_LEFT | J_RIGHT)) chain ^= 1;
        if (p & J_SELECT) as_text ^= 1;
        if (p & J_B) return;
    }
}

static void tx_result(void) {
    char *detail;
    uint8_t ticks = 0, failed;
    header("SIGNED");
    center(4, "SIGNATURE SENT");
    center(5, "TO PHONE");
    for (;;) {
        if (chip_call(CMD_TXSTATUS, 0, 0, 0) == 0) {
            detail = resp + strlen(resp) + 1;
            failed = !strcmp(resp, "FAILED") || !strcmp(resp, "UNKNOWN");
            clear_row(8);
            center(8, resp);
            if (*detail) {
                /* on failure the chip sends a reason instead of a signature */
                at(1, 10, failed ? "WHY:" : "TX: ");
                wrap_n(1, 11, 18, detail, 2);
            }
            if (failed || !strcmp(resp, "CONFIRMED")) break;
        }
        wait_frames(30);
        if (++ticks > 120) {
            center(15, "STILL CONFIRMING.");
            center(16, "CHECK YOUR PHONE");
            break;
        }
    }
    center(17, "A: DONE");
    flush_input();
    while (!(wait_press() & J_A)) {}
}

static void sign_request(void) {
    uint8_t held = 0, shown = 0, k, st;
    uint16_t hold_start = 0, elapsed;
    char *to, *amount, *fee, *network;
    if (chip_call(CMD_PENDING, 0, 0, 0) != 0) return;
    /* every field below was decoded and written by the chip, not the phone */
    to = resp + 1;
    amount = to + strlen(to) + 1;
    fee = amount + strlen(amount) + 1;
    network = fee + strlen(fee) + 1;
    beep(0xF0);
    header("!! SIGN REQUEST !!");
    wrap_n(0, 2, 20, network, 1);
    at(0, 4, "SEND");
    wrap_n(1, 5, 18, amount, 2);
    at(0, 7, "FEE");
    wrap_n(4, 7, 16, fee, 1);
    at(0, 8, "TO");
    wrap_n(1, 9, 18, to, 3);
    at(0, 14, "CHECK THE ADDRESS!");
    at(0, 16, "HOLD A: SIGN");
    at(0, 17, "B: REJECT");
    bar(12, 0, 60);
    /* arm only once every button is up, so a press left over from the
     * previous screen can neither reject nor start approving */
    while (held_keys) vsync();
    flush_input();
    for (;;) {
        vsync();
        frame++;
        k = held_keys;
        if (k & J_B) {
            beep(0x40);
            chip_call(CMD_SIGN, 0, 0, 0);
            header("REJECTED");
            center(8, "NOTHING WAS SIGNED");
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
            if ((uint8_t)(elapsed >> 2) != shown) {
                shown = (uint8_t)(elapsed >> 2);
                beep(0x90 + (uint8_t)elapsed);
                bar(12, (uint8_t)elapsed, 60);
            }
        } else if (held) {
            held = 0;
            shown = 0;
            bar(12, 0, 60);
        }
    }
    flush_input(); /* the A that was held to sign must not answer the next screen */
    beep(0xF8);
    header("SIGNING");
    center(8, "SECURE CHIP IS");
    center(9, "SIGNING...");
    st = chip_call(CMD_SIGN, 1, 0, 0);
    if (st == ST_TIMEOUT) {
        /* the chip may still finish and hand the signature to the phone */
        header("NO ANSWER");
        center(7, "THE CHIP DIDN'T");
        center(8, "ANSWER IN TIME");
        center(10, "CHECK YOUR PHONE");
        center(16, "A: OK");
        flush_input();
        while (!(wait_press() & J_A)) {}
        return;
    }
    if (st != 0) {
        header("NOT SIGNED");
        center(7, "THE CHIP COULD NOT");
        center(8, "SIGN THIS REQUEST");
        center(16, "A: OK");
        flush_input();
        while (!(wait_press() & J_A)) {}
        return;
    }
    tx_result();
}

/* Returns 1 to re-lock, 2 after a wipe. */
static uint8_t menu(void) {
    uint8_t sel = 0, p, i;
    const char *items[] = {"RECEIVE", "LOCK", "WIPE CARTRIDGE", "BACK"};
    for (;;) {
        header("MENU");
        for (i = 0; i < 4; i++) {
            at(2, 4 + i * 2, i == sel ? ">" : " ");
            at(4, 4 + i * 2, items[i]);
        }
        at(0, 17, "A:SELECT  B:BACK");
        p = wait_press();
        if ((p & J_UP) && sel) sel--;
        if ((p & J_DOWN) && sel < 3) sel++;
        if (p & J_B) return 0;
        if (!(p & J_A)) continue;
        if (sel == 0) receive();
        if (sel == 1) {
            chip_call(CMD_LOCK, 0, 0, 0);
            return 1;
        }
        if (sel == 2) {
            header("WIPE CARTRIDGE?");
            center(6, "THIS ERASES THE KEYS");
            center(7, "FOR GOOD. ONLY YOUR");
            center(8, "12 WORDS CAN");
            center(9, "RESTORE THEM.");
            at(0, 16, "SELECT+A: WIPE");
            at(0, 17, "B: CANCEL");
            for (;;) {
                vsync();
                p = held_keys;
                if ((p & (J_SELECT | J_A)) == (J_SELECT | J_A)) {
                    chip_call(CMD_WIPE, 0, 0, 0);
                    return 2;
                }
                if (p & J_B) break;
            }
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
        frame++;
        if (MB[MB_PENDING]) {
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
        }
        if (++refresh >= 120) {
            refresh = 0;
            draw_account(CHAIN_SOL, 4);
            draw_account(CHAIN_EVM, 8);
        }
    }
}

void main(void) {
    uint8_t st;
    DISPLAY_ON;
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
