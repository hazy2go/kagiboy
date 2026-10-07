/* Tile graphics for the wallet UI: text, captions, frames, icons, bars, fades. */
#ifndef GFX_H
#define GFX_H

#include <stdint.h>
#include "assets.h"

#define SCREEN_W 20
#define SCREEN_H 18

void gfx_init(void);
void gfx_load_logo(void);    /* boot only: logo replaces the caption font */
void gfx_load_captions(void);

void fade_out(void);
void fade_in(void);
void screen_begin(void);     /* fade to white, clear, hide sprites */
void screen_end(void);       /* fade back in */

void clear(void);
void clear_rows(uint8_t y, uint8_t h);
void put(uint8_t x, uint8_t y, uint8_t tile);
uint8_t txt(uint8_t x, uint8_t y, const char *s);          /* ink; returns chars drawn */
void txt_n(uint8_t x, uint8_t y, const char *s, uint8_t n);
void txtc(uint8_t y, const char *s);
uint8_t cap(uint8_t x, uint8_t y, const char *s);          /* grey caps */
void capc(uint8_t y, const char *s);
void wrap(uint8_t x, uint8_t y, uint8_t w, const char *s, uint8_t rows);
uint8_t num(uint8_t x, uint8_t y, uint16_t v);
uint8_t big(uint8_t x, uint8_t y, const char *s);          /* 2-row digits; returns width */
uint8_t big_width(const char *s);
void box(uint8_t x, uint8_t y, uint8_t w, uint8_t h);
void rule(uint8_t y);
void icon(uint8_t x, uint8_t y, uint8_t first);
void bar(uint8_t x, uint8_t y, uint8_t w, uint16_t v, uint16_t max);
void hint(uint8_t x, uint8_t y, uint8_t btn, const char *label);
void header(uint8_t icon_first, const char *title, const char *sub);

void cursor(uint8_t tx, uint8_t ty);  /* animated arrow sprite left of a tile */
void marker(uint8_t tx, uint8_t ty);  /* animated dot sprite under a tile */
void sprites_hide(void);
void anim_tick(uint8_t frame);

#define BTN_A 1
#define BTN_B 2
#define BTN_SEL 3

#endif
