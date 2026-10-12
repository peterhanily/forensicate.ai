import { describe, expect, it } from 'vitest';
import { parseConfigYaml } from '../src/config';
import { parseYamlRuleFile } from '../src/yamlRules';

describe('YAML scalar and list preservation', () => {
  it('keeps config lists across comments and blank lines', () => {
    const config = parseConfigYaml('categories:\n  - first\n  # comment\n\n  - second\n');
    expect(config.categories).toEqual(['first', 'second']);
  });

  it('preserves hashes in quoted config values', () => {
    expect(parseConfigYaml('paths: ["notes#1.md"] # a comment').paths).toEqual(['notes#1.md']);
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
  - id: second
    name: Hash example
    type: keyword
    keywords:
      - "topic #1"
`);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rules).toHaveLength(2);
    expect(parsed.rules[0].keywords).toEqual(['hello', 'world', 'https://example.com']);
    expect(parsed.rules[1].keywords).toEqual(['topic #1']);
  });
});
