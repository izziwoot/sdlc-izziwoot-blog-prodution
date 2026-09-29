/** One linearised sRGB channel of a #rgb or #rrggbb colour. */
function channel(hex: string, index: number): number {
  const normalized =
    hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const byte = Number.parseInt(normalized.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return byte <= 0.03928 ? byte / 12.92 : ((byte + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG 2.x. */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
