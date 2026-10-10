import { useState } from "react";
import "./video-screen.css";

/**
 * A YouTube video framed like the Game Boy's screen: grey bezel, the two stripes, a caption in them.
 * Shows our own poster until it's played, so YouTube (via its no-cookie domain) only loads on a click.
 */
export function VideoScreen({ id, title, caption, poster }: { id: string; title: string; caption: string; poster: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="vscreen">
      <p className="vscreen-stripe px" aria-hidden>
        <i />
        <span>{caption}</span>
        <i />
      </p>
      <div className="vscreen-lcd">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" className="vscreen-poster" onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`}>
            <img
              src={`${poster}-640.webp`}
              srcSet={`${poster}-640.webp 640w, ${poster}.webp 1280w`}
              sizes="(max-width: 860px) 92vw, 900px"
              width={1280}
              height={720}
              alt=""
              loading="lazy"
            />
            <span className="vscreen-play px" aria-hidden>
              <svg viewBox="0 0 7 9" width="14" height="18" shapeRendering="crispEdges">
                <path d="M0 0h2v1h2v1h2v1h1v3h-1v1h-2v1h-2v1h-2z" fill="currentColor" />
              </svg>
              PLAY
            </span>
          </button>
        )}
      </div>
      <figcaption className="vscreen-cap">
        <span className="vscreen-led" aria-hidden />
        {title}
        <a href={`https://youtu.be/${id}`} target="_blank" rel="noreferrer">
          Watch on YouTube
        </a>
      </figcaption>
    </figure>
  );
}
