/** Shorten on a word boundary and add an ellipsis when something was cut. */
export function truncateWords(text: string, max = 80): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const window = cleaned.slice(0, max);
  const lastSpace = window.lastIndexOf(" ");
  const cut = (lastSpace > 0 ? window.slice(0, lastSpace) : window).trimEnd();
  return `${cut}…`;
}
