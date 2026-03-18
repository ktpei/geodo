// Newline constant — avoids Vite minifier converting \n in template literals
// to actual newlines, which breaks the JS in content script bundles.
export const NL = String.fromCharCode(10);

export function joinLines(...parts: string[]): string {
  return parts.filter(Boolean).join(NL);
}
