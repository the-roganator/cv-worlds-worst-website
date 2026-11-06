/**
 * The share's test vector, from the factory's contract (docs/COMPONENTS/FEATURE-FLAGS.md, "Test vector", in
 * the-roganator/cv-software-factory), and a signer that makes more like it with the same key.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { shareMessage } from '../../src/flags/share.ts';

export const VECTOR = {
  privateKey:
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g\n-----END PRIVATE KEY-----\n',
  publicKey:
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=\n-----END PUBLIC KEY-----\n',
  request: { id: 'traffic-007', time: 1793001600, host: 'website.localhost', method: 'GET', path: '/search?q=glove' },
  message:
    '0000001c736f6674776172652d666163746f72792073686172652d69642076310000000b747261666669632d3030370000000a3137393330303136303000000011776562736974652e6c6f63616c686f7374000000034745540000000f2f7365617263683f713d676c6f7665',
  headers: {
    'x-share-id': 'traffic-007',
    'x-share-time': '1793001600',
    'x-share-signature': 'so1eBQuRv1KfCSVYqZIIvAw24N-DIIFbE1IZxbAQiilqhAAZbk5RqiUTthh7gDkK39T_VHLj6I9Q95SArrAeAw',
  },
} as const;

/** The three headers for a request, signed with `privateKey` (the vector's, unless another is given). */
export function signed(
  request: { id: string; time: number | string; host: string; method: string; path: string },
  privateKey: string = VECTOR.privateKey,
): Record<string, string> {
  const message = shareMessage({ ...request, time: String(request.time) });
  return {
    'x-share-id': request.id,
    'x-share-time': String(request.time),
    'x-share-signature': sign(null, message, createPrivateKey(privateKey)).toString('base64url'),
  };
}
