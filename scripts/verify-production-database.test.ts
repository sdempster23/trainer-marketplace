// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { verifyDirectoryHtml, verifyProductionDatabase } from './verify-production-database.mjs';

const expected = 'iomaiasjqozunjbvsdsk';
const other = 'abcdefghijklmnopqrst';
const directory = 'https://joinpawmatch.com/trainers';
const avatar = (ref = expected) => `https://${ref}.supabase.co/storage/v1/object/public/avatars/11111111-2222-4333-8444-555555555555/avatar?v=1789744887273`;
const image = (url = avatar()) => `<img alt="Trainer photo" src="/_next/image?url=${encodeURIComponent(url)}&amp;w=3840&amp;q=75"/>`;

describe('production database evidence', () => {
  it('uses the observed directory image format when public JavaScript has no database URL', () => {
    const html = `<script src="/_next/static/chunks/login.js"></script>${image()}`;
    expect(verifyDirectoryHtml(html, directory)).toEqual({ projectRef: expected, avatarCount: 1 });
  });

  it('accepts consistent direct and optimized avatars on the canonical www host', () => {
    const html = `${image()}<img src="${avatar()}"/>`;
    expect(verifyDirectoryHtml(html, 'https://www.joinpawmatch.com/trainers')).toEqual({ projectRef: expected, avatarCount: 2 });
  });

  it.each([
    ['another database', image(avatar(other))],
    ['conflicting databases', image() + image(avatar(other))],
    ['no avatars', '<h1>Find a dog trainer</h1>'],
    ['a URL in text', `<p>${avatar()}</p>`],
    ['an image-like string in script', `<script>const example = '${image()}';</script>`],
    ['an image in a comment', `<!-- ${image()} -->`],
    ['another image bucket', image(avatar().replace('/avatars/', '/trainer-gallery/'))],
    ['a lookalike database hostname', image(avatar().replace('.supabase.co', '.supabase.co.example.com'))],
    ['an insecure image', image(avatar().replace('https:', 'http:'))],
    ['a nonstandard image port', image(avatar().replace('.co/', '.co:444/'))],
    ['credentials in an image', image(avatar().replace('https://', 'https://someone@'))],
    ['a nonnumeric version', image(avatar().replace('1789744887273', 'unexpected'))],
    ['an extra query parameter', image(avatar() + '&other=1')],
    ['an invalid profile path', image(avatar().replace('11111111-2222-4333-8444-555555555555', 'another-file'))],
    ['an external image proxy', image().replace('/_next/image?', 'https://example.com/_next/image?')],
    ['a malformed image source', '<img src="http://[invalid"/>'],
  ])('refuses %s', (_name, html) => {
    expect(() => verifyDirectoryHtml(html, directory)).toThrow('Live database verification stopped');
  });

  it('does not accept the expected evidence from another page or site', () => {
    expect(() => verifyDirectoryHtml(image(), 'https://joinpawmatch.com/login')).toThrow('expected public page');
    expect(() => verifyDirectoryHtml(image(), 'https://example.com/trainers')).toThrow('expected public page');
  });

  it('fetches only the public directory, with no login or database request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(image()));
    await expect(verifyProductionDatabase(fetcher)).resolves.toEqual({ projectRef: expected, avatarCount: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(new URL(directory), expect.objectContaining({ redirect: 'manual' }));
  });

  it('follows a same-site canonical redirect', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 308, headers: { location: 'https://www.joinpawmatch.com/trainers' } }))
      .mockResolvedValueOnce(new Response(image()));
    await expect(verifyProductionDatabase(fetcher)).resolves.toMatchObject({ projectRef: expected });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refuses a redirect off the trusted site before fetching its destination', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://example.com/trainers' } }));
    await expect(verifyProductionDatabase(fetcher)).rejects.toThrow('Unexpected live-site address');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refuses an unsuccessful response even if its body contains expected evidence', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(image(), { status: 503 }));
    await expect(verifyProductionDatabase(fetcher)).rejects.toThrow('(503)');
  });
});
