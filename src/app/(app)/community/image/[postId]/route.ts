import * as uc from '@/application/use-cases';
import { getCtx } from '@/app/lib/session';
import { getDeps } from '@/infrastructure/container';

/**
 * The photo of one post, for <img> on the web. The database decides whether the signed-in viewer may see
 * the post (get_post_image -> can_view_post). Bytes are always served as image/jpeg with nosniff, so a file
 * can never be interpreted as a page or a script, and never cached by shared caches.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return notFound();
  const ctx = await getCtx().catch(() => null);
  if (!ctx) return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
  const res = await uc.getPostImage(await getDeps(), ctx, { postId });
  if (!res.ok) return notFound();
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(res.data.image);
  if (!match) return notFound();
  const bytes = Buffer.from(match[1]!, 'base64');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return notFound();
  return new Response(bytes, {
    headers: {
      'content-type': 'image/jpeg',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'cache-control': 'private, max-age=300',
    },
  });
}
