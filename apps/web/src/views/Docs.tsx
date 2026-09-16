/* The documentation area: one page per topic, reached from the footer.
 *
 * Pages are written for someone who has never read the code, with the
 * technical layer folded underneath. Each page names the source files it
 * describes, and `npm run docs:check` refuses a deploy when one of them
 * changed after the page did — so what is written here is kept to the code by
 * rule rather than by good intentions.
 *
 * On a phone the side navigation folds into a menu button; it is the same
 * list of links, so there is one navigation, not two.
 */

import { useId, useState } from "react";

import "../docs/docs.css";
import { DOC_PAGES, findPage, pageComponent } from "../docs/registry";

export function Docs({ slug }: { slug?: string }) {
  const page = findPage(slug);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  const index = page ? DOC_PAGES.indexOf(page) : -1;
  const previous = index > 0 ? DOC_PAGES[index - 1] : null;
  const next = index >= 0 && index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : null;
  const Page = page ? pageComponent(page) : null;

  return (
    <div className="docs">
      <aside className="docs-side">
        <button
          type="button"
          className="btn docs-menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="faint">Docs ·</span> {page?.title ?? "Contents"}
          <span aria-hidden="true" className="docs-caret">
            ▾
          </span>
        </button>
        <nav id={menuId} className={`docs-nav ${menuOpen ? "open" : ""}`} aria-label="Documentation">
          <div className="eyebrow">documentation</div>
          <ol>
            {DOC_PAGES.map((p) => (
              <li key={p.slug}>
                <a
                  href={`#/docs/${p.slug}`}
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {p.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <article className="docs-article">
        {page && Page ? (
          <>
            <header className="docs-head">
              <div className="eyebrow">docs · {String(index + 1).padStart(2, "0")}</div>
              <h1>{page.title}</h1>
              <p className="docs-summary">{page.summary}</p>
            </header>
            <Page />
            <footer className="docs-foot">
              <div className="docs-pager">
                {previous ? (
                  <a href={`#/docs/${previous.slug}`} className="docs-pager-link">
                    <span className="faint tiny">Previous</span>
                    <span>{previous.title}</span>
                  </a>
                ) : (
                  <span />
                )}
                {next && (
                  <a href={`#/docs/${next.slug}`} className="docs-pager-link next">
                    <span className="faint tiny">Next</span>
                    <span>{next.title}</span>
                  </a>
                )}
              </div>
              <p className="tiny faint">
                This page describes{" "}
                {page.sources.map((source, i) => (
                  <span key={source}>
                    {i > 0 && (i === page.sources.length - 1 ? " and " : ", ")}
                    <code>{source}</code>
                  </span>
                ))}
                . A change to any of them without a change to this page stops the deploy.
              </p>
            </footer>
          </>
        ) : (
          <header className="docs-head">
            <div className="eyebrow">docs</div>
            <h1>Page not found</h1>
            <p className="docs-summary">
              There is no documentation page called “{slug}”. <a href="#/docs">Start from the overview</a>.
            </p>
          </header>
        )}
      </article>
    </div>
  );
}
