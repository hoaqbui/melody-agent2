export function fuzzyMatch(text: string, query: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  return normalize(text).includes(normalize(query));
}
