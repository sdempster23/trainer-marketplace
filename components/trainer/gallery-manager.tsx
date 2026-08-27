"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";

import {
  addGalleryPhoto,
  moveGalleryPhoto,
  removeGalleryPhoto,
} from "@/app/(trainer)/actions";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { encodeGalleryPhoto } from "@/lib/images/client-encode";
import {
  GALLERY_BUCKET,
  GALLERY_MAX_PHOTOS,
  galleryObjectName,
  newGalleryFileName,
} from "@/lib/images/gallery";
import { createClient } from "@/lib/supabase/client";

export type GalleryPhoto = {
  id: string;
  /** Validated + rebuilt server-side; a row that fails validation never arrives. */
  url: string;
};

/**
 * The trainer's gallery card on /trainer/listing — upload, reorder, remove.
 *
 * Same three-step pipeline as the avatar (client re-encode → direct-to-
 * storage under M18 RLS → server action sniffs before any row points at the
 * bytes), with one difference: the client generates the object NAME (a
 * uuid), because gallery objects are many and immutable. The server accepts
 * that single input only as a uuid, and the M19 CHECK pins the same shape.
 *
 * ONE error slot cleared per attempt (the avatar-editor lesson: action
 * states never reset, so a stale error outlives a later success).
 *
 * Reorder is move-up/move-down buttons, not drag-and-drop: no new
 * dependency, keyboard-accessible for free, and it matches the scale (max
 * eight photos).
 */
export function GalleryManager({
  userId,
  photos,
}: {
  userId: string;
  photos: GalleryPhoto[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, startWork] = useTransition();
  const isFull = photos.length >= GALLERY_MAX_PHOTOS;

  function onFilePicked(file: File | undefined) {
    if (!file) {
      return;
    }
    startWork(async () => {
      setError(null);
      try {
        const { blob, contentType } = await encodeGalleryPhoto(file);
        const fileName = newGalleryFileName();
        const supabase = createClient();
        const { error: uploadErr } = await supabase.storage
          .from(GALLERY_BUCKET)
          .upload(galleryObjectName(userId, fileName), blob, { contentType });
        if (uploadErr) {
          setError("Upload failed. Check your connection and try again.");
          return;
        }
        const result = await addGalleryPhoto(fileName);
        if (result && "error" in result) {
          setError(result.error);
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Something went wrong. Try again.",
        );
      }
    });
  }

  function run(action: () => Promise<{ error: string } | { success: true } | null>) {
    startWork(async () => {
      setError(null);
      const result = await action();
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {photos.length === 0 ? (
        <EmptyState compact>
          No photos yet — add training shots so owners can see your work.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-1">
              <div className="bg-muted relative aspect-square overflow-hidden rounded-md">
                <Image
                  src={photo.url}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 200px, 45vw"
                  className="object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || index === 0}
                    aria-label={`Move photo ${index + 1} earlier`}
                    onClick={() => run(() => moveGalleryPhoto(photo.id, "up"))}
                  >
                    ←
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || index === photos.length - 1}
                    aria-label={`Move photo ${index + 1} later`}
                    onClick={() => run(() => moveGalleryPhoto(photo.id, "down"))}
                  >
                    →
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  aria-label={`Remove photo ${index + 1}`}
                  onClick={() => run(() => removeGalleryPhoto(photo.id))}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy || isFull}
          onClick={() => fileInputRef.current?.click()}
        >
          {isBusy ? "Working…" : "Add a photo"}
        </Button>
        <span className="text-muted-foreground text-xs">
          {photos.length} of {GALLERY_MAX_PHOTOS}
          {isFull ? " — remove one to add another" : null}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          onFilePicked(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
