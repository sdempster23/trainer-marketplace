"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The public gallery on a trainer's detail page: a thumbnail grid that opens
 * a simple full-size viewer.
 *
 * LCP discipline (arc-notes' transferable constraints): every thumbnail is
 * lazily loaded and explicitly sized inside a fixed aspect-ratio box, so up
 * to eight photos below the fold add no CLS and never compete with the H1
 * as the LCP element. The full-size image is only mounted while the viewer
 * is open — a closed gallery costs one small client component and nothing
 * else.
 *
 * The viewer is deliberately plain (no dependency): Escape and a backdrop
 * click close it, arrows step through. A lightbox library would be a
 * heavier answer to a smaller question — but "plain" still owes the modal
 * contract: focus moves in on open, Tab is trapped inside (otherwise the
 * keyboard walks the page BEHIND the overlay and can activate invisible
 * links), page scroll is locked, and focus returns to the thumbnail that
 * opened it.
 */
export function GalleryGrid({
  photos,
  trainerName,
}: {
  photos: { id: string; url: string }[];
  trainerName: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** The thumbnail that opened the viewer — focus goes back here on close. */
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((current) =>
        current === null
          ? null
          : (current + delta + photos.length) % photos.length,
      ),
    [photos.length],
  );

  useEffect(() => {
    if (openIndex === null) {
      return;
    }
    const opener = openerRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // Focus the dialog itself (tabIndex -1) so the next Tab lands on the
    // first control INSIDE it, not on the page behind.
    dialogRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key === "ArrowRight") {
        step(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        step(-1);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      // Trap: cycle within the dialog's own focusables.
      const focusables =
        dialogRef.current.querySelectorAll<HTMLElement>("button");
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [openIndex, close, step]);

  const open = openIndex === null ? null : photos[openIndex];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={(event) => {
                openerRef.current = event.currentTarget;
                setOpenIndex(index);
              }}
              className="focus-visible:ring-ring bg-muted relative block aspect-square w-full overflow-hidden rounded-md focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`View photo ${index + 1} of ${photos.length} from ${trainerName}`}
            >
              <Image
                src={photo.url}
                alt=""
                fill
                sizes="(min-width: 640px) 200px, 45vw"
                className="object-cover transition-transform hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo from ${trainerName}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="relative flex max-h-full w-full max-w-3xl flex-col items-center gap-3 outline-none"
            // The image column swallows clicks so only the backdrop closes.
            onClick={(event) => event.stopPropagation()}
          >
            {/* fill inside a fixed box, NOT hardcoded intrinsic dimensions:
                encodeGalleryPhoto preserves aspect ratio, so a declared 4:3
                would reserve a landscape box and visibly snap when a
                portrait photo decodes. object-contain letterboxes instead. */}
            <div className="relative h-[70vh] w-full">
              <Image
                src={open.url}
                alt={`Training photo from ${trainerName}`}
                fill
                sizes="(min-width: 768px) 768px, 100vw"
                className="rounded-md object-contain"
                priority
              />
            </div>
            <div className="flex items-center gap-2 text-white">
              {photos.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="rounded-md border border-white/40 px-3 py-1 text-sm"
                    aria-label="Previous photo"
                  >
                    ←
                  </button>
                  <span className="text-xs tabular-nums">
                    {openIndex! + 1} / {photos.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="rounded-md border border-white/40 px-3 py-1 text-sm"
                    aria-label="Next photo"
                  >
                    →
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-white/40 px-3 py-1 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
