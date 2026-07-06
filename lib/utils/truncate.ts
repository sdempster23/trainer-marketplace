/**
 * Preview truncation, counted in code POINTS. String.slice cuts at UTF-16
 * code UNITS, so a cap landing inside a surrogate pair (any emoji) leaves a
 * lone high surrogate that renders as U+FFFD — spreading the string iterates
 * code points instead, so the boundary character survives whole or is
 * dropped whole. Shared by the thread-list preview and the newMessage email
 * template (one truncation rule, one place).
 */
export function truncatePreview(text: string, maxCodePoints: number): string {
  const points = [...text];
  if (points.length <= maxCodePoints) {
    return text;
  }
  return `${points.slice(0, maxCodePoints).join("")}…`;
}
