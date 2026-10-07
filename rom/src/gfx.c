#include <gb/gb.h>
#include <string.h>
#include "gfx.h"

#define PAL_NORMAL 0xE4 /* shade 0 lightest .. 3 darkest */
static const uint8_t fade_steps[] = {0xE4, 0x90, 0x40, 0x00};

static uint8_t rowbuf[SCREEN_W];
static uint8_t cur_x, cur_y, cur_kind; /* sprite position in tiles; kind 0 = hidden */

void gfx_init(void) {
    set_bkg_data(T_FONT_INK, N_FONT_INK, font_ink_tiles);
    set_bkg_data(T_FONT_GREY, N_FONT_GREY, font_grey_tiles);
    set_bkg_data(T_UI, N_UI, ui_tiles);
    BGP_REG = 0x00;
    OBP0_REG = PAL_NORMAL;
    set_sprite_tile(0, T_CURSOR);
    SHOW_BKG;
    SHOW_SPRITES;
    sprites_hide();
}

void gfx_load_logo(void) {
    set_bkg_data(T_FONT_GREY, N_LOGO, logo_tiles);
}

void gfx_load_captions(void) {
    set_bkg_data(T_FONT_GREY, N_FONT_GREY, font_grey_tiles);
}

static void set_pal(uint8_t p) {
    BGP_REG = p;
    OBP0_REG = p;
}

void fade_out(void) {
    uint8_t i;
    if (BGP_REG == 0x00) return;
    for (i = 1; i < 4; i++) {
        set_pal(fade_steps[i]);
        vsync();
        vsync();
    }
}

void fade_in(void) {
    uint8_t i;
    for (i = 3; i > 0; i--) {
        set_pal(fade_steps[i - 1]);
        vsync();
        vsync();
    }
}

void screen_begin(void) {
    fade_out();
    sprites_hide();
    SCX_REG = 0;
    SCY_REG = 0;
    clear();
}

void screen_end(void) {
    fade_in();
}

void clear(void) {
    fill_bkg_rect(0, 0, SCREEN_W, SCREEN_H, T_FONT_INK); /* tile 0 is the space glyph */
}

void clear_rows(uint8_t y, uint8_t h) {
    fill_bkg_rect(0, y, SCREEN_W, h, T_FONT_INK);
}

void put(uint8_t x, uint8_t y, uint8_t tile) {
    set_bkg_tile_xy(x, y, tile);
}

void txt_n(uint8_t x, uint8_t y, const char *s, uint8_t n) {
    uint8_t i = 0;
    while (s[i] && i < n && x + i < SCREEN_W) {
        uint8_t c = (uint8_t)s[i];
        rowbuf[i] = (c >= 32 && c < 128) ? c - 32 : '?' - 32;
        i++;
    }
    if (i) set_bkg_tiles(x, y, i, 1, rowbuf);
}

uint8_t txt(uint8_t x, uint8_t y, const char *s) {
    uint8_t n = (uint8_t)strlen(s);
    txt_n(x, y, s, n);
    return n;
}

void txtc(uint8_t y, const char *s) {
    uint8_t n = (uint8_t)strlen(s);
    txt(n < SCREEN_W ? (SCREEN_W - n) / 2 : 0, y, s);
}

uint8_t cap(uint8_t x, uint8_t y, const char *s) {
    uint8_t i = 0;
    while (s[i] && x + i < SCREEN_W) {
        uint8_t c = (uint8_t)s[i];
        if (c >= 'a' && c <= 'z') c -= 32;
        rowbuf[i] = (c >= 32 && c <= 90) ? T_FONT_GREY + c - 32 : T_FONT_GREY;
        i++;
    }
    if (i) set_bkg_tiles(x, y, i, 1, rowbuf);
    return i;
}

void capc(uint8_t y, const char *s) {
    uint8_t n = (uint8_t)strlen(s);
    cap(n < SCREEN_W ? (SCREEN_W - n) / 2 : 0, y, s);
}

void wrap(uint8_t x, uint8_t y, uint8_t w, const char *s, uint8_t rows) {
    uint8_t n = (uint8_t)strlen(s);
    while (n && rows--) {
        txt_n(x, y++, s, w);
        if (n <= w) break;
        s += w;
        n -= w;
    }
}

uint8_t num(uint8_t x, uint8_t y, uint16_t v) {
    char b[6];
    uint8_t i = 5;
    b[5] = 0;
    do {
        b[--i] = '0' + v % 10;
        v /= 10;
    } while (v);
    return txt(x, y, b + i);
}

static uint8_t big_index(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c == '.') return 10;
    return 11; /* space */
}

uint8_t big_width(const char *s) {
    uint8_t n = 0;
    while (s[n] && s[n] != ' ') n++;
    return n;
}

/* Digits and '.' in the tall face; anything else in the small ink font on the lower row. */
uint8_t big(uint8_t x, uint8_t y, const char *s) {
    uint8_t i = 0;
    while (s[i] && s[i] != ' ' && x + i < SCREEN_W) {
        char c = s[i];
        if ((c >= '0' && c <= '9') || c == '.') {
            uint8_t t = T_BIG_0 + big_index(c) * 2;
            put(x + i, y, t);
            put(x + i, y + 1, t + 1);
        } else {
            put(x + i, y + 1, (uint8_t)c - 32);
        }
        i++;
    }
    return i;
}

void box(uint8_t x, uint8_t y, uint8_t w, uint8_t h) {
    uint8_t i;
    put(x, y, T_FRAME_TL);
    put(x + w - 1, y, T_FRAME_TR);
    put(x, y + h - 1, T_FRAME_BL);
    put(x + w - 1, y + h - 1, T_FRAME_BR);
    for (i = 1; i < w - 1; i++) {
        put(x + i, y, T_FRAME_T);
        put(x + i, y + h - 1, T_FRAME_B);
    }
    for (i = 1; i < h - 1; i++) {
        put(x, y + i, T_FRAME_L);
        put(x + w - 1, y + i, T_FRAME_R);
    }
}

void rule(uint8_t y) {
    fill_bkg_rect(1, y, SCREEN_W - 2, 1, T_RULE);
}

void icon(uint8_t x, uint8_t y, uint8_t first) {
    put(x, y, first);
    put(x + 1, y, first + 1);
    put(x, y + 1, first + 2);
    put(x + 1, y + 1, first + 3);
}

/* A rounded track w tiles wide that fills pixel by pixel. */
void bar(uint8_t x, uint8_t y, uint8_t w, uint16_t v, uint16_t max) {
    uint16_t px = max ? (uint16_t)((uint32_t)v * (w * 8) / max) : 0;
    uint8_t i, fill;
    if (px > w * 8) px = w * 8;
    rowbuf[0] = T_BAR_CAP_L;
    for (i = 0; i < w; i++) {
        fill = px >= 8 ? 8 : (uint8_t)px;
        rowbuf[i + 1] = T_BAR_0 + fill;
        px = px >= 8 ? px - 8 : 0;
    }
    rowbuf[w + 1] = T_BAR_CAP_R;
    set_bkg_tiles(x, y, w + 2, 1, rowbuf);
}

void hint(uint8_t x, uint8_t y, uint8_t btn, const char *label) {
    if (btn == BTN_SEL) {
        put(x, y, T_BTN_SEL_L);
        put(x + 1, y, T_BTN_SEL_R);
        x += 3;
    } else {
        put(x, y, btn == BTN_A ? T_BTN_A : T_BTN_B);
        x += 2;
    }
    cap(x, y, label);
}

void header(uint8_t icon_first, const char *title, const char *sub) {
    icon(1, 1, icon_first);
    txt(4, 1, title);
    if (sub) cap(4, 2, sub);
    rule(3);
}

void cursor(uint8_t tx, uint8_t ty) {
    cur_x = tx;
    cur_y = ty;
    cur_kind = 1;
    set_sprite_tile(0, T_CURSOR);
}

void marker(uint8_t tx, uint8_t ty) {
    cur_x = tx;
    cur_y = ty;
    cur_kind = 2;
    set_sprite_tile(0, T_DOT);
}

void sprites_hide(void) {
    cur_kind = 0;
    move_sprite(0, 0, 0);
}

/* Gentle bob: the cursor drifts right, the marker drifts up. */
void anim_tick(uint8_t frame) {
    uint8_t off = (frame >> 3) & 3;
    if (off == 3) off = 1;
    if (cur_kind == 1) move_sprite(0, cur_x * 8 + 8 - 2 + off, cur_y * 8 + 16);
    else if (cur_kind == 2) move_sprite(0, cur_x * 8 + 8, cur_y * 8 + 16 - off);
}
