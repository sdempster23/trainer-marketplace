"use client";

import { useRef, useState, useTransition } from "react";

import { commitAvatar, removeAvatar } from "@/app/(account)/actions";
import { Avatar } from "@/components/shared/avatar";
import { Button } from "@/components/ui/button";
import { AVATARS_BUCKET, avatarObjectName } from "@/lib/images/avatar";
import { encodeAvatar } from "@/lib/images/client-encode";
import { createClient } from "@/lib/supabase/client";

/**
 * The /account "Your photo" row — role-universal, the DisplayNameEditor's
 * sibling. Three-step flow per the §3 transport split: (1) re-encode on
 * device (512px, EXIF stripped), (2) direct-to-storage upload under the M18
 * exact-path RLS (upsert — replace and first-upload are the same path),
 * (3) commitAvatar server action sniffs the bytes and writes the pointer.
 *
 * ONE error slot, cleared at the start of every attempt and written by
 * whichever step fails — the actions are called directly (not through
 * useActionState) because action states never reset, so a stale error from
 * one action would outlive a later successful other action (review finding).
 *
 * userId comes from the server page (the session's claims.sub) — it is NOT
 * trusted for authorization; RLS rejects any upload outside the real
 * caller's own path, and commitAvatar re-derives everything from the JWT.
 */
export function AvatarEditor({
  userId,
  avatarPath,
  displayName,
}: {
  userId: string;
  avatarPath: string | null;
  displayName: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, startWork] = useTransition();

  function onFilePicked(file: File | undefined) {
    if (!file) {
      return;
    }
    startWork(async () => {
      setError(null);
      try {
        const { blob, contentType } = await encodeAvatar(file);
        const supabase = createClient();
        const { error: uploadErr } = await supabase.storage
          .from(AVATARS_BUCKET)
          .upload(avatarObjectName(userId), blob, {
            upsert: true,
            contentType,
          });
        if (uploadErr) {
          setError("Upload failed. Check your connection and try again.");
          return;
        }
        const result = await commitAvatar();
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

  function onRemove() {
    startWork(async () => {
      setError(null);
      const result = await removeAvatar();
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Avatar
            profileId={userId}
            avatarPath={avatarPath}
            displayName={displayName}
            size={56}
          />
          <div className="grid gap-0.5">
            <span className="text-muted-foreground">Your photo</span>
            <span
              className={
                avatarPath ? "font-medium" : "text-muted-foreground italic"
              }
            >
              {avatarPath ? "Set" : "Not set"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            {isBusy ? "Working…" : avatarPath ? "Replace" : "Add photo"}
          </Button>
          {avatarPath ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={onRemove}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {/* accept deliberately omits HEIC: iOS transcodes to JPEG for inputs
          that don't accept it, and the re-encode normalizes the rest. */}
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
