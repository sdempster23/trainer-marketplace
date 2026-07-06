import { z } from "zod";

/**
 * The id gate for values compared against Postgres uuid COLUMNS — z.guid(),
 * NOT z.uuid(), argued once here (previously copy-pasted at three sites):
 * zod's uuid() enforces RFC-4122 version/variant bits, but the gate's job is
 * to match what the uuid column accepts (any 8-4-4-4-12 hex). The seed's
 * readable anchors (5eed0001-…) are valid column values with a "version 0" —
 * z.uuid() would 404/reject every seed row at the gate instead of letting
 * RLS and the DB judge them.
 */
export function dbIdSchema(message?: string) {
  return z.guid(message);
}
