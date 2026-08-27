import type { SupabaseClient } from "@supabase/supabase-js";

import { publicGalleryUrl } from "@/lib/images/gallery";
import type { Database } from "@/types/supabase";

export type GalleryPhotoView = { id: string; url: string };

/**
 * A trainer's gallery, ordered, with every row's URL REBUILT from validated
 * parts — the one read path for both the public detail page and the
 * trainer's own manager, so the untrusted-read rule (CLAUDE.md) can't be
 * honoured in one place and forgotten in the other.
 *
 * A row whose file_name fails validation is DROPPED, not rendered: the M19
 * CHECK already refuses such a value, so a row that somehow holds one is
 * either legacy or hostile, and neither belongs in an <img> src.
 *
 * Failure returns an empty list AND LOGS HERE — gallery photos are
 * decoration on both pages, so a failed read must never take a listing down
 * with it, but "globally broken" and "no photos yet" render identically.
 * Logging inside the helper (rather than asking every call site to
 * remember) is what keeps that difference visible in the server logs.
 */
export async function getGalleryPhotos(
  supabase: SupabaseClient<Database>,
  trainerId: string,
): Promise<{ photos: GalleryPhotoView[]; error: string | null }> {
  const { data, error } = await supabase
    .from("trainer_gallery_photos")
    .select("id, file_name")
    .eq("trainer_id", trainerId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[GALLERY] read failed:", error.message);
    return { photos: [], error: error.message };
  }

  const photos = data.flatMap((row) => {
    const url = publicGalleryUrl(trainerId, row.file_name);
    return url ? [{ id: row.id, url }] : [];
  });
  return { photos, error: null };
}
