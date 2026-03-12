/**
 * GET /api/telemetry/ping
 *
 * Fires an 'app_start' telemetry event if telemetry is enabled in settings.
 * Called once per app launch from the client-side AppShell useEffect.
 *
 * Returns 200 always — telemetry must never block the UI.
 */

import { NextResponse }                from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { sendTelemetryEvent }          from '@/lib/telemetry';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    noStore();

    try {
        await sendTelemetryEvent('app_start');
    } catch {
        // Never fail — telemetry is fire-and-forget
    }

    return NextResponse.json({ ok: true });
}
