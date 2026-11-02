import { describe, expect, it } from 'vitest';
import { hostnameOf, normalizeUrl } from '../src/core/url';

describe('normalizeUrl', () => {
  it('adds https and accepts valid urls', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl(' http://example.com/a?b=1 ')).toBe('http://example.com/a?b=1');
    expect(normalizeUrl('localhost:3000')).toBe('https://localhost:3000/');
  });
  it('rejects junk and non-web schemes', () => {
    for (const bad of ['', 'hello world', 'javascript:alert(1)', 'ftp://x.com', 'nodots']) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });
  it('hostnameOf strips www', () => expect(hostnameOf('https://www.example.com/x')).toBe('example.com'));
});
