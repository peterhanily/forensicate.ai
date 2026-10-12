/** Remove YAML comments while preserving hashes inside quoted/scalar values. */
export function stripYamlComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quote === '"' && char === '\\') {
      i++;
    } else if (quote === "'" && char === "'" && line[i + 1] === "'") {
      i++;
    } else if (quote && char === quote) {
      quote = null;
    } else if (!quote && (char === '"' || char === "'")) {
      quote = char;
    } else if (!quote && char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}
