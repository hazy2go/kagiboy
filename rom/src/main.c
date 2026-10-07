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

/* Prints s wrapped to width w starting at (x, y); returns the next free row. */
static uint8_t wrap(uint8_t x, uint8_t y, uint8_t w, const char *s) {
    uint8_t c = 0;
    gotoxy(x, y);
    while (*s) {
        if (c == w) {
            c = 0;
            y++;
            gotoxy(x, y);
        }
        putchar(*s++);
        c++;
    }
    return y + 1;
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

static uint8_t keys, prev_keys;

static uint8_t pressed(void) {
    prev_keys = keys;
    keys = joypad();
    return keys & ~prev_keys;
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
        add_entropy(DIV_REG);
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

static void new_wallet(void) {
    entropy_buttons();
    entropy_motion();
    header("NEW WALLET");
    center(8, "GENERATING KEYS");
    center(9, "IN SECURE CHIP...");
    expect_ok(chip_call(CMD_CREATE, 0, 0, 0));
    show_words();
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
    at(1, y + 1, bal);
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

static void receive(void) {
    uint8_t chain = CHAIN_SOL, p;
    for (;;) {
        header("RECEIVE");
        at(0, 3, chain == CHAIN_SOL ? "< SOLANA DEVNET  >" : "< ETH SEPOLIA     >");
        if (chip_call(CMD_ACCOUNT, chain, 0, 0) == 0) wrap(1, 6, 18, resp);
        center(13, "SEND ONLY TESTNET");
        center(14, "FUNDS TO THIS");
        at(0, 17, "LEFT/RIGHT  B:BACK");
        p = wait_press();
        if (p & (J_LEFT | J_RIGHT)) chain ^= 1;
        if (p & J_B) return;
    }
}

static void tx_result(void) {
    char *sig;
    uint8_t ticks = 0;
    header("SIGNED");
    center(4, "SIGNATURE SENT");
    center(5, "TO PHONE");
    for (;;) {
        if (chip_call(CMD_TXSTATUS, 0, 0, 0) == 0) {
            sig = resp + strlen(resp) + 1;
            clear_row(8);
            center(8, resp);
            if (*sig) {
                at(1, 10, "TX:");
                wrap(1, 11, 18, sig);
            }
            if (!strcmp(resp, "CONFIRMED") || !strcmp(resp, "FAILED")) break;
        }
        wait_frames(30);
        if (++ticks > 40) break;
    }
    center(17, "A: DONE");
    while (!(wait_press() & J_A)) {}
}

static void sign_request(void) {
    uint8_t chain, held = 0, shown = 0, k;
    uint16_t hold_start = 0, elapsed;
    char *to, *amount;
    if (chip_call(CMD_PENDING, 0, 0, 0) != 0) return;
    chain = (uint8_t)resp[0];
    to = resp + 1;
    amount = to + strlen(to) + 1;
    beep(0xF0);
    header("!! SIGN REQUEST !!");
    at(0, 3, chain == CHAIN_SOL ? "SOLANA DEVNET" : "ETH SEPOLIA");
    at(0, 5, "SEND");
    at(1, 6, amount);
    at(0, 8, "TO");
    wrap(1, 9, 18, to);
    at(0, 14, "CHECK THE ADDRESS!");
    at(0, 16, "HOLD A: SIGN");
    at(0, 17, "B: REJECT");
    bar(12, 0, 60);
    for (;;) {
        vsync();
        frame++;
        k = joypad();
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
    beep(0xF8);
    header("SIGNING");
    center(8, "SECURE CHIP IS");
    center(9, "SIGNING...");
    expect_ok(chip_call(CMD_SIGN, 1, 0, 0));
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
                p = joypad();
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
