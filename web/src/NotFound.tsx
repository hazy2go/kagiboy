import { useEffect } from "react";
import { Link } from "react-router-dom";

/** Any unknown address: an empty slot, and the two ways back. */
export function NotFound() {
  useEffect(() => {
    document.documentElement.classList.add("kb-root");
    document.title = "Not found · kagiboy";
    return () => {
      document.documentElement.classList.remove("kb-root");
      document.title = "kagiboy";
    };
  }, []);

  return (
    <div className="kb not-found">
      <nav className="kb-nav" aria-label="Main">
        <Link to="/" className="kb-word" aria-label="kagiboy home">
          kagiboy
        </Link>
      </nav>
      <main>
        <p className="px">ERROR 404</p>
        <h1>This cartridge is empty.</h1>
        <p>There's nothing at this address. Blow on the contacts and try one of these.</p>
        <div className="actions">
          <Link to="/" className="btn btn-ink">
            Home
          </Link>
          <Link to="/demo" className="btn btn-paper">
            Live demo
          </Link>
        </div>
      </main>
    </div>
  );
}
