import { pathToFileURL } from 'node:url';

const expectedRef = 'iomaiasjqozunjbvsdsk';
const allowedHosts = new Set(['joinpawmatch.com', 'www.joinpawmatch.com']);
const avatarPath = /^\/storage\/v1\/object\/public\/avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar$/i;

function isSiteUrl(url) {
  return url.protocol === 'https:' && allowedHosts.has(url.hostname)
    && !url.username && !url.password && !url.port;
}

/**
 * The public directory renders avatar URLs rebuilt by lib/images/avatar.ts
 * from NEXT_PUBLIC_SUPABASE_URL, a validated profile UUID, and a numeric version.
 * Home/login JavaScript need not contain a database URL: their reads and login
 * run on the server. Inspect only real image tags, never arbitrary page text.
 */
export function verifyDirectoryHtml(html, pageUrl) {
  const page = new URL(pageUrl);
  if (!isSiteUrl(page) || page.pathname !== '/trainers') {
    throw new Error('The live directory did not remain on the expected public page.');
  }
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const refs = new Set();
  let avatarCount = 0;
  for (const tag of markup.matchAll(/<img\b[^>]*>/gi)) {
    const source = tag[0].match(/\ssrc\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!source) continue;
    let image;
    try {
      image = new URL(source.replaceAll('&amp;', '&'), page);
      if (isSiteUrl(image) && image.pathname === '/_next/image') {
        const targets = image.searchParams.getAll('url');
        if (targets.length !== 1) continue;
        image = new URL(targets[0]);
      }
    } catch { continue; }
    const ref = image.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
    if (!ref || image.protocol !== 'https:' || image.username || image.password || image.port
        || image.hash || !avatarPath.test(image.pathname) || !/^\?v=\d+$/.test(image.search)) continue;
    refs.add(ref);
    avatarCount += 1;
  }
  if (refs.size !== 1 || !refs.has(expectedRef)) {
    throw new Error(`Live database verification stopped: ${avatarCount} canonical directory avatars, ${refs.size} distinct project hosts. Expected only ${expectedRef}. No migration was applied. Verify the deployed configuration before continuing.`);
  }
  return { projectRef: expectedRef, avatarCount };
}

export async function verifyProductionDatabase(fetcher = fetch) {
  let address = new URL('https://joinpawmatch.com/trainers');
  for (let hops = 0; hops <= 4; hops += 1) {
    if (!isSiteUrl(address)) throw new Error('Unexpected live-site address; stop and verify production configuration.');
    const response = await fetcher(address, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Live-site redirect has no destination.');
      address = new URL(location, address);
      continue;
    }
    if (!response.ok) throw new Error(`Live directory verification failed (${response.status}).`);
    const html = await response.text();
    if (html.length > 4 * 1024 * 1024) throw new Error('Live directory exceeded the verification size limit.');
    return verifyDirectoryHtml(html, address.href);
  }
  throw new Error('Too many live-site redirects; stop and verify production configuration.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { projectRef, avatarCount } = await verifyProductionDatabase();
    console.log(`Verified current joinpawmatch.com database: ${projectRef} (${avatarCount} directory avatars).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Live database verification failed.');
    process.exitCode = 1;
  }
}
