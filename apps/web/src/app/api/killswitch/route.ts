// ============================================================
// POST /api/killswitch — Emergency shutdown endpoint
// ============================================================
// Called by:
//   • Dashboard red Killswitch button (browser fetch)
//   • Telegram bot (/killswitch confirm) via internal HTTP
//
// Body: { reason?, shutdownPC?, triggeredBy?, details? }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { executeKillswitch, type KillswitchReason } from '@/lib/killswitch';

// Never cache — emergency shutdown must always execute live
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const reason: KillswitchReason = body.reason || 'manual_dashboard';
        const shutdownPC: boolean = body.shutdownPC === true;
        const triggeredBy: string = body.triggeredBy || 'dashboard';
        const details: string = body.details || '';

        const result = executeKillswitch({ reason, shutdownPC, triggeredBy, details });

        return NextResponse.json({
            success: result.success,
            logPath: result.logPath,
            message: 'Killswitch triggered - Skales is shutting down.',
            error: result.error,
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
