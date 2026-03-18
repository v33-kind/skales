'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle, Zap, Shield } from 'lucide-react';
import { checkForUpdates, type UpdateCheckResult } from '@/actions/updates';
import { useTranslation } from '@/lib/i18n';

const Icon = ({ icon: I, ...props }: { icon: any; [key: string]: any }) => {
    const C = I;
    return <C {...props} />;
};

export default function UpdatePage() {
    const { t } = useTranslation();
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState<UpdateCheckResult | null>(null);

    const handleCheck = async () => {
        setChecking(true);
        try { setResult(await checkForUpdates()); }
        catch { /* ignore */ }
        finally { setChecking(false); }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-5">

            {/* ── Header ────────────────────────────────────── */}
            <div>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    🔄 {t('updates.autoUpdates')}
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t('updates.autoUpdatesDescription')}
                </p>
            </div>

            {/* ── Auto-update badge ─────────────────────────── */}
            <div className="rounded-2xl border p-5 flex items-start gap-4"
                style={{ background: 'var(--surface)', borderColor: 'rgba(132,204,22,0.35)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(132,204,22,0.12)', border: '1px solid rgba(132,204,22,0.3)' }}>
                    <Icon icon={Zap} size={20} className="text-lime-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-lime-400">Built-in auto-updater active</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        Skales uses <code className="px-1 rounded" style={{ background: 'var(--surface-light)' }}>electron-updater</code> to
                        check for and apply updates automatically. Updates are downloaded and installed in the background —
                        you'll see a notification when a new version is ready.
                    </p>
                </div>
            </div>

            {/* ── Version status after manual check ─────────── */}
            {result && (
                <div className={`rounded-2xl border p-4 flex items-center gap-3 ${result.updateAvailable ? 'text-lime-400' : 'text-green-400'}`}
                    style={{
                        background: result.updateAvailable ? 'rgba(132,204,22,0.07)' : 'rgba(34,197,94,0.07)',
                        borderColor: result.updateAvailable ? 'rgba(132,204,22,0.4)' : 'rgba(34,197,94,0.3)',
                    }}>
                    <Icon icon={CheckCircle} size={18} className="shrink-0" />
                    <div>
                        {result.updateAvailable
                            ? <p className="text-sm font-semibold">Update available: v{result.updateInfo?.version} — it will install automatically on next restart.</p>
                            : <p className="text-sm font-semibold">You&apos;re on the latest version (v{result.currentVersion}).</p>
                        }
                        {result.error && <p className="text-xs mt-0.5 text-red-400">{result.error}</p>}
                    </div>
                </div>
            )}

            {/* ── Check Now button ──────────────────────────── */}
            <button
                onClick={handleCheck}
                disabled={checking}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-black font-bold text-sm transition-all disabled:opacity-50">
                <Icon icon={RefreshCw} size={15} className={checking ? 'animate-spin' : ''} />
                {checking ? t('update.checking') : t('updates.checkNow')}
            </button>

            {/* ── Security note ─────────────────────────────── */}
            <div className="rounded-xl border px-4 py-3 flex items-start gap-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <Icon icon={Shield} size={15} className="text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('update.security')} </span>
                    Updates fetched from <code className="px-1 rounded" style={{ background: 'var(--surface-light)' }}>skales.app</code> (hardcoded).
                    SHA-256 verified. Your <code className="px-1 rounded" style={{ background: 'var(--surface-light)' }}>.skales-data/</code> is never touched during updates.
                </p>
            </div>

        </div>
    );
}
