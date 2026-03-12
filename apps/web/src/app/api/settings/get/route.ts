/**
 * GET /api/settings/get
 *
 * Returns a safe subset of current Skales settings.
 * Only exposes non-sensitive fields — never returns API keys, tokens,
 * system prompts, or other personal/confidential data.
 *
 * Used by client-only pages (e.g. Desktop Buddy) that cannot call
 * Server Actions directly.
 */

import { NextResponse }                  from 'next/server';
import { unstable_noStore as noStore }   from 'next/cache';
import { loadSettings }                  from '@/actions/chat';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

// Fields that are safe to expose to the client
const SAFE_FIELDS = new Set([
    'buddy_skin',
    'persona',
    'theme',
    'locale',
    'safetyMode',
]);

export async function GET() {
    noStore();

    try {
        const settings = await loadSettings();
        const safe: Record<string, unknown> = {};

        for (const key of SAFE_FIELDS) {
            if (key in (settings as any)) {
                safe[key] = (settings as any)[key];
            }
        }

        return NextResponse.json(safe);
    } catch {
        return NextResponse.json({});
    }
}
