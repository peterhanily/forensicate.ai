/** Remove YAML comments while preserving hashes inside quoted/scalar values. */
export function stripYamlComment(line: string): string {
  let quote: '"' | "'" | null = null;
  let atScalarStart = true;
  let quotedScalar = false;
  let flowDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quote) {
      if (quote === '"' && char === '\\') {
        i++;
      } else if (quote === "'" && char === "'" && line[i + 1] === "'") {
        i++;
      } else if (char === quote) {
        quote = null;
        quotedScalar = true;
      }
      continue;
    }

    if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
    if (/\s/.test(char)) continue;

    // Quotes inside a plain scalar (children's books, 12" ruler) are literal.
    // Only a new scalar can begin a quoted string.
    if (atScalarStart && (char === '"' || char === "'")) {
      quote = char;
      atScalarStart = false;
    } else if (atScalarStart && (char === '[' || char === '{')) {
      flowDepth++;
    } else if (flowDepth > 0 && (char === ']' || char === '}')) {
      flowDepth--;
      atScalarStart = false;
      quotedScalar = false;
    } else if (flowDepth > 0 && char === ',') {
      atScalarStart = true;
      quotedScalar = false;
    } else if (char === ':' && (
      i === line.length - 1 || /\s/.test(line[i + 1]) || (flowDepth > 0 && quotedScalar)
    )) {
      atScalarStart = true;
      quotedScalar = false;
    } else if (atScalarStart && (char === '-' || char === '?') && /\s/.test(line[i + 1] ?? '')) {
      // Block sequence items and explicit mapping keys precede a new scalar.
      continue;
    } else {
      atScalarStart = false;
      quotedScalar = false;
    }
  }
  return line;
}
