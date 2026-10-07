GBDK ?= $(HOME)/gbdk
LCC = $(GBDK)/bin/lcc
TITLE := $(shell node -p "require('../brand.json').romTitle.slice(0,15)")

OUT = build/wallet.gb

all: $(OUT)
	cp $(OUT) ../web/public/wallet.gb

src/brand.h: ../brand.json
	node ../scripts/gen-brand.mjs

$(OUT): src/main.c src/brand.h
	mkdir -p build
	$(LCC) -Wa-l -Wl-m -Wm-yn"$(TITLE)" -o $(OUT) src/main.c

clean:
	rm -rf build

.PHONY: all clean
