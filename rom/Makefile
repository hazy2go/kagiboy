GBDK ?= $(HOME)/gbdk
LCC = $(GBDK)/bin/lcc
TITLE := $(shell node -p "require('../brand.json').romTitle.slice(0,15)")

OUT = build/wallet.gb
DEMO_OUT = build/wallet-demo.gb

all: $(OUT)
	cp $(OUT) ../web/public/wallet.gb

src/brand.h: ../brand.json
	node ../scripts/gen-brand.mjs

$(OUT): src/main.c src/gfx.c src/gfx.h src/assets.c src/brand.h
	mkdir -p build
	$(LCC) -Wa-l -Wl-m -Wm-yn"$(TITLE)" -o $(OUT) src/main.c src/gfx.c src/assets.c

# Demo cartridge for real hardware without a key chip: an in-ROM mock chip
# (-DDEMO_CHIP) serves the attract-mode wallet so every screen can be shown.
demo: $(DEMO_OUT)
	cp $(DEMO_OUT) $(HOME)/Desktop/kagiboy-demo.gb

$(DEMO_OUT): src/main.c src/gfx.c src/gfx.h src/assets.c src/brand.h src/demo_chip.h
	mkdir -p build
	$(LCC) -DDEMO_CHIP -Wa-l -Wl-m -Wm-yn"$(TITLE)" -o $(DEMO_OUT) src/main.c src/gfx.c src/assets.c

# canned replies from the real browser chip; needs web/ dependencies installed
src/demo_chip.h: assets/gen_demo_chip.mts ../web/src/chip/chip.ts ../web/src/chip/keys.ts
	../web/node_modules/.bin/tsx assets/gen_demo_chip.mts

clean:
	rm -rf build

.PHONY: all demo clean

src/assets.c src/assets.h: assets/gen_assets.py
	python3 assets/gen_assets.py
