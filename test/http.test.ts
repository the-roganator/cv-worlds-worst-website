import { describe, expect, it } from 'vitest';
import { matchPath } from '../src/http.ts';

describe('matchPath', () => {
  it('matches a fixed path exactly', () => {
    expect(matchPath('/about', '/about')).toEqual({});
    expect(matchPath('/about', '/about/us')).toBeUndefined();
    expect(matchPath('/about', '/abou')).toBeUndefined();
  });

  it('names the parts that vary, decoded', () => {
    expect(matchPath('/products/:slug', '/products/glove-left')).toEqual({ slug: 'glove-left' });
    expect(matchPath('/products/:slug', '/products/a%20b')).toEqual({ slug: 'a b' });
  });

  it('does not match an empty or badly encoded part', () => {
    expect(matchPath('/products/:slug', '/products/')).toBeUndefined();
    expect(matchPath('/products/:slug', '/products/%E0%A4%A')).toBeUndefined();
  });
});
