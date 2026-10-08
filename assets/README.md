# Assets

| Folder | What's in it |
|---|---|
| `3d/` | The Game Boy and cartridge, built in Blender from Python (`build.py`), with the label, the console face print and the cartridge's circuit board generated as textures. `render.py` makes the stills on the website, `products.py` the product shots. Exported as a meshopt-compressed GLB to `web/public/3d/`. |
| `logo/` | The logo: the pixel key from the ROM's boot screen, plus the wordmark. `logo.html` is the source. |
| `og/` | The social preview card. |
| `renders/` | Rendered stills and product shots. |
| `ref/` | Measurements of a real DMG, used to get the proportions right. |

The `.blend` files aren't in git (they're big and rebuilt by the scripts).
