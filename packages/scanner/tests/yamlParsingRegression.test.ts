import { describe, expect, it } from 'vitest';
import { parseConfigYaml } from '../src/config';
import { parseYamlRuleFile } from '../src/yamlRules';
import { stripYamlComment } from '../src/yamlComments';

describe('YAML scalar and list preservation', () => {
  it('keeps config lists across comments and blank lines', () => {
    const config = parseConfigYaml('categories:\n  - first\n  # comment\n\n  - second\n');
    expect(config.categories).toEqual(['first', 'second']);
  });

  it('preserves hashes in quoted config values', () => {
    expect(parseConfigYaml('paths: ["notes#1.md"] # a comment').paths).toEqual(['notes#1.md']);
  });

  it('strips comments after literal quotes in plain config paths', () => {
    const config = parseConfigYaml(`paths:
  - children's books.md # catalog label
  - 12" ruler.md # measurements
  - a "quoted title.md # unclosed literal quote
`);
    expect(config.paths).toEqual(["children's books.md", '12" ruler.md', 'a "quoted title.md']);
  });

  it('imports plain keywords containing apostrophes without their comments', () => {
    const parsed = parseYamlRuleFile(`name: Catalog
type: keyword
keywords:
  - children's books # catalog label
  - 12" ruler # measurement label
`);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rules[0].keywords).toEqual(["children's books", '12" ruler']);
  });

  it('preserves quoted hashes alongside plain apostrophes in inline lists', () => {
    const config = parseConfigYaml(`paths: [children's books.md, "topic #1.md", 'topic #2.md'] # catalog`);
    expect(config.paths).toEqual(["children's books.md", 'topic #1.md', 'topic #2.md']);
  });

  it.each([
    ['name: a, "title # comment', 'name: a, "title '],
    ['name: a["title # comment', 'name: a["title '],
    ['name: a{"title # comment', 'name: a{"title '],
    ['name: https://example.com/author\'s # comment', 'name: https://example.com/author\'s '],
    ['- "topic #1" # comment', '- "topic #1" '],
    ["name: 'children''s # books' # comment", "name: 'children''s # books' "],
    [String.raw`name: "A \"quoted # title\"" # comment`, String.raw`name: "A \"quoted # title\"" `],
    ['names: ["topic #1", [\'topic #2\']] # comment', 'names: ["topic #1", [\'topic #2\']] '],
    ['names: {"title":"topic #1"} # comment', 'names: {"title":"topic #1"} '],
  ])('recognizes scalar boundaries in %s', (line, expected) => {
    expect(stripYamlComment(line)).toBe(expected);
  });

  it('preserves unquoted nested keywords in rule packs', () => {
    const parsed = parseYamlRuleFile(`name: Example pack
rules: # ordinary rules
  - id: greeting
    name: Greeting
    type: keyword
    keywords:
      - hello
      - world
      - https://example.com
      - children's books # catalog label
  - id: second
    name: Hash example
    type: keyword
    keywords:
      - "topic #1"
`);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rules).toHaveLength(2);
    expect(parsed.rules[0].keywords).toEqual(['hello', 'world', 'https://example.com', "children's books"]);
    expect(parsed.rules[1].keywords).toEqual(['topic #1']);
  });
});
