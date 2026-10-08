// "Masonry Lightbox" by ayushmxxn on 21st.dev (component id 26223), adapted for kagiboy: plain <img>,
// an even grid of 4:5 tiles instead of masonry columns (symmetric, and nothing re-flows while a photo
// zooms back into its tile),
// the site's colours and type, photos tagged with what the screen shows.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export interface ImageType {
  id: number;
  src: string;
  alt: string;
  description: string;
  /** intrinsic pixel size — used so the tile matches the photo's real
   * proportions instead of cropping it. Defaults to DEFAULT_WIDTH/HEIGHT below. */
  width?: number;
  height?: number;
  /** kagiboy: where a tile's crop is anchored (CSS object-position) */
  position?: string;
}

export interface MasonryLightboxProps {
  images?: ImageType[];
  className?: string;
}

/* ------------------------------------------------------------------
   Customize the gallery here — everything below is used by the
   component further down and doesn't change how it works.
------------------------------------------------------------------ */

// fallback size used when an image doesn't specify width/height
const DEFAULT_WIDTH = 1260;
const DEFAULT_HEIGHT = 750;

// grid layout
const GRID_MAX_WIDTH = "max-w-none";
const GRID_PADDING = "p-0";
const GRID_COLUMNS = "grid grid-cols-2 md:grid-cols-3"; // kagiboy: an even grid, every tile 4:5
const GRID_GAP = "gap-3 sm:gap-4 lg:gap-5";

// tile appearance
const TILE_RADIUS = "rounded-[22px]";
const TILE_BG = "bg-muted";
const TILE_MARGIN_BOTTOM = "";
const TILE_HOVER_SCALE = "group-hover:scale-[1.06]";

// modal (lightbox) appearance
const MODAL_RADIUS = "rounded-2xl";
const MODAL_BG = "bg-card";
const MODAL_BACKDROP = "bg-[#1f2330]/55 backdrop-blur-md";
const MODAL_PADDING = "p-4 sm:p-10 lg:p-16"; // space around the opened image
const MODAL_MAX_SIZE = "max-w-[92vw] md:max-w-[640px] max-h-[82vh]";

// animation timing
const ENTRANCE_DURATION = 0.6; // grid tile fade/blur-in duration (seconds)
const ENTRANCE_STAGGER = 0.05; // delay added per tile (seconds)
const ENTRANCE_STAGGER_MAX = 12; // cap so later tiles don't wait too long
const ENTRANCE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const HOVER_LIFT = -3; // px the tile rises on hover
const MODAL_SPRING = { stiffness: 260, damping: 28 }; // open/close spring
const BACKDROP_DURATION = 0.25; // backdrop fade in/out
const CAPTION_DELAY = 0.2; // modal caption fade-in delay
const CAPTION_DURATION = 0.35;
const CLOSE_BUTTON_DELAY = 0.15;

/* ------------------------------------------------------------------ */



const emptySubscribe = () => () => {};

export const MasonryLightbox = ({
  images = [],
  className = "",
}: MasonryLightboxProps) => {
  const [selected, setSelected] = useState<ImageType | null>(null);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const prefersReducedMotion = useReducedMotion();

  // lock scroll + close on escape while the viewer is open
  useEffect(() => {
    if (!selected) return;

    // compensate for the scrollbar disappearing so the page doesn't
    // shift sideways and throw off the centering while the modal is open
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", onKey);
    };
  }, [selected]);

  const modal = (
    <AnimatePresence>
      {selected && (
        <motion.div
          className={`fixed inset-0 z-50 flex items-center justify-center ${MODAL_BACKDROP} ${MODAL_PADDING}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: BACKDROP_DURATION }}
          onClick={() => setSelected(null)}
        >
          <motion.div
            layoutId={`photo-${selected.id}`}
            className={`relative overflow-hidden ${MODAL_RADIUS} shadow-2xl ${MODAL_BG}`}
            transition={{ type: "spring", ...MODAL_SPRING }}
            onClick={(e) => e.stopPropagation()}
          >
            <img               src={selected.src}
              alt={selected.alt}
              width={selected.width ?? DEFAULT_WIDTH}
              height={selected.height ?? DEFAULT_HEIGHT}
              className={`block w-auto h-auto ${MODAL_MAX_SIZE} object-contain`}
            />

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: CAPTION_DELAY, duration: CAPTION_DURATION }}
              className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-5"
            >
              <p className="font-px text-[13px] tracking-[0.14em] text-white">{selected.description}</p>
            </motion.div>

            <motion.button
              type="button"
              aria-label="Close"
              onClick={() => setSelected(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: CLOSE_BUTTON_DELAY }}
              className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-white cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 2L14 14M14 2L2 14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      className={`relative w-full flex flex-col items-center justify-center my-auto ${GRID_PADDING} overflow-x-hidden select-none ${className}`}
    >
      <div
        className={`w-full ${GRID_MAX_WIDTH} mx-auto ${GRID_COLUMNS} ${GRID_GAP}`}
      >
        {images.map((image, i) => {
          const w = image.width ?? DEFAULT_WIDTH;
          const h = image.height ?? DEFAULT_HEIGHT;
          return (
            <motion.button
              key={image.id}
              type="button"
              layoutId={`photo-${image.id}`}
              onClick={() => setSelected(image)}
              className={`group relative ${TILE_MARGIN_BOTTOM} block w-full border-0 p-0 min-w-0 overflow-hidden ${TILE_RADIUS} ${TILE_BG} text-left cursor-pointer focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-white`}
              style={{ aspectRatio: "4 / 5" }}
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 16, filter: "blur(6px)" }
              }
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                duration: ENTRANCE_DURATION,
                delay: (i % ENTRANCE_STAGGER_MAX) * ENTRANCE_STAGGER,
                ease: ENTRANCE_EASE,
              }}
              whileHover={prefersReducedMotion ? undefined : { y: HOVER_LIFT }}
            >
              <img
                src={image.src}
                alt={image.alt}
                loading="lazy"
                decoding="async"
                width={w}
                height={h}
                className={`block h-full w-full object-cover transition-transform duration-700 ease-out ${TILE_HOVER_SCALE}`}
                style={{ objectPosition: image.position ?? "50% 50%" }}
              />

              <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-4 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                <p className="font-px text-[11px] tracking-[0.14em] text-white">{image.description}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {mounted ? createPortal(modal, document.body) : null}
    </div>
  );
};

export default MasonryLightbox;

