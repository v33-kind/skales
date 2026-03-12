'use client';

import { useState, useEffect, useRef } from 'react';
import {
    RefreshCw, Download, CheckCircle, AlertCircle, ChevronDown,
    ChevronRight, Shield, Clock, Package, ExternalLink, Loader2,
    RotateCcw, Zap, Archive,
} from 'lucide-react';
import {
    checkForUpdates, type UpdateCheckResult, type UpdateInfo,
    saveInstallLater, getInstallLater, clearInstallLater, listBackups, type BackupEntry,
} from '@/actions/updates';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

const Icon = ({ icon: I, ...props }: { icon: any; [key: string]: any }) => {
    const C = I;
    return <C {...props} />;
};

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return iso; }
}

function timeAgo(iso: string): string {
    try {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60_000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`;
        return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) !== 1 ? 's' : ''} ago`;
    } catch { return iso; }
}

type DownloadPhase =
    | { phase: 'idle' }
    | { phase: 'connecting' }
    | { phase: 'downloading'; percent: number; downloadedSize: number; totalSize: number }
    | { phase: 'verifying' }
    | { phase: 'done'; filePath: string; checksumVerified: boolean; totalSize: number }
    | { phase: 'error'; message: string };

type InstallStep = { step: number; label: string; status: 'pending' | 'running' | 'done' | 'error'; message?: string; };

const INSTALL_STEPS_TEMPLATE: InstallStep[] = [
    { step: 1, label: 'Backup current version', status: 'pending' },
    { step: 2, label: 'Extract update ZIP', status: 'pending' },
    { step: 3, label: 'Install new files', status: 'pending' },
    { step: 4, label: 'Run npm install', status: 'pending' },
    { step: 5, label: 'Restart Skales', status: 'pending' },
];

type InstallState =
    | { phase: 'idle' }
    | { phase: 'installing'; steps: InstallStep[] }
    | { phase: 'restart'; reloadIn: number }
    | { phase: 'manual_restart' }
    | { phase: 'error'; message: string; rolledBack?: boolean }
    | { phase: 'rollback' };

export default function UpdatePage() {
    const { t } = useTranslation();
    const [result, setResult] = useState<UpdateCheckResult | null>(null);
    const [checking, setChecking] = useState(false);
    const [downloadState, setDownloadState] = useState<DownloadPhase>({ phase: 'idle' });
    const [installState, setInstallState] = useState<InstallState>({ phase: 'idle' });
    const [previousExpanded, setPreviousExpanded] = useState(false);
    const [backupsExpanded, setBackupsExpanded] = useState(false);
    const [backups, setBackups] = useState<BackupEntry[]>([]);
    const [pendingInstall, setPendingInstall] = useState<{ zipPath: string; version: string } | null>(null);
    const [reloadCounter, setReloadCounter] = useState(0);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        handleCheck();
        getInstallLater().then(setPendingInstall);
        listBackups().then(setBackups);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (installState.phase === 'restart') {
            const secs = installState.reloadIn;
            setReloadCounter(secs);
            const interval = setInterval(() => {
                setReloadCounter(c => {
                    if (c <= 1) { clearInterval(interval); window.location.reload(); }
                    return c - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [installState]);

    const handleCheck = async () => {
        setChecking(true);
        try { setResult(await checkForUpdates()); }
        catch { /* ignore */ }
        finally { setChecking(false); }
    };

    const handleDownload = async () => {
        if (!result?.updateInfo) return;
        const info = result.updateInfo;
        const platform = result.platform;
        const downloadUrl = platform === 'macos' ? info.macos : info.windows;
        const checksum = platform === 'macos' ? info.checksum_macos : info.checksum_windows;
        const filename = `skales-${info.version}-${platform}.zip`;
        if (!downloadUrl) { setDownloadState({ phase: 'error', message: `No download URL found for ${platform}` }); return; }
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setDownloadState({ phase: 'connecting' });
        try {
            const response = await fetch('/api/update/download', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: downloadUrl, checksumExpected: checksum, filename }),
                signal: abortRef.current.signal,
            });
            if (!response.ok || !response.body) { setDownloadState({ phase: 'error', message: 'Failed to start download' }); return; }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || '';
                for (const part of parts) {
                    const line = part.trim();
                    if (!line.startsWith('data:')) continue;
                    try {
                        const evt = JSON.parse(line.slice(5).trim());
                        if (evt.event === 'progress') {
                            if (evt.status === 'Verifying integrity...') {
                                setDownloadState({ phase: 'verifying' });
                            } else {
                                setDownloadState({ phase: 'downloading', percent: evt.percent ?? 0, downloadedSize: evt.downloadedSize ?? 0, totalSize: evt.totalSize ?? 0 });
                            }
                        } else if (evt.event === 'done') {
                            setDownloadState({ phase: 'done', filePath: evt.filePath, checksumVerified: evt.checksumVerified, totalSize: evt.totalSize ?? 0 });
                        } else if (evt.event === 'error') {
                            setDownloadState({ phase: 'error', message: evt.message });
                        }
                    } catch { /* skip */ }
                }
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') setDownloadState({ phase: 'error', message: e.message });
        }
    };

    const handleInstallNow = async (zipPath: string) => {
        setInstallState({ phase: 'installing', steps: INSTALL_STEPS_TEMPLATE.map(s => ({ ...s })) });
        await clearInstallLater();
        setPendingInstall(null);
        try {
            const response = await fetch('/api/update/install', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ zipPath }),
            });
            if (!response.ok || !response.body) { setInstallState({ phase: 'error', message: 'Failed to start install' }); return; }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || '';
                for (const part of parts) {
                    const line = part.trim();
                    if (!line.startsWith('data:')) continue;
                    try {
                        const evt = JSON.parse(line.slice(5).trim());
                        if (evt.step) {
                            setInstallState(prev => {
                                if (prev.phase !== 'installing') return prev;
                                return { ...prev, steps: prev.steps.map(s => s.step === evt.step ? { ...s, status: evt.status, message: evt.message } : s) };
                            });
                        } else if (evt.event === 'restart') {
                            setInstallState({ phase: 'restart', reloadIn: evt.reloadIn ?? 10 });
                            listBackups().then(setBackups);
                        } else if (evt.event === 'manual_restart') {
                            setInstallState({ phase: 'manual_restart' });
                            listBackups().then(setBackups);
                        } else if (evt.event === 'error') {
                            setInstallState({ phase: 'error', message: evt.message });
                        } else if (evt.event === 'rollback') {
                            setInstallState({ phase: 'rollback' });
                        } else if (evt.event === 'rollback_done') {
                            setInstallState({ phase: 'error', message: 'Install failed - your previous version has been restored.', rolledBack: true });
                        }
                    } catch { /* skip */ }
                }
            }
        } catch (e: any) {
            setInstallState({ phase: 'error', message: e.message });
        }
    };

    const handleInstallLater = async (zipPath: string, version: string) => {
        await saveInstallLater(zipPath, version);
        setPendingInstall({ zipPath, version });
        setDownloadState({ phase: 'idle' });
    };

    const info = result?.updateInfo;
    const isDownloading = ['downloading', 'connecting', 'verifying'].includes(downloadState.phase);

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-5">

            {/* ── Pending Install Banner ─────────────────────── */}
            {pendingInstall && installState.phase === 'idle' && (
                <div className="rounded-2xl border p-4 flex items-center gap-3"
                    style={{ background: 'rgba(132,204,22,0.07)', borderColor: 'rgba(132,204,22,0.4)' }}>
                    <Icon icon={Download} size={16} className="text-lime-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-lime-400">Update v{pendingInstall.version} ready to install</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{pendingInstall.zipPath}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleInstallNow(pendingInstall.zipPath)}
                            className="text-xs px-3 py-1.5 rounded-lg font-bold" style={{ background: '#84cc16', color: 'black' }}>
                            {t('update.installNow')}
                        </button>
                        <button onClick={async () => { await clearInstallLater(); setPendingInstall(null); }}
                            className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                            {t('update.dismiss')}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Header ────────────────────────────────────── */}
            <div>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('update.title')}</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{t('update.subtitle')}</p>
            </div>

            {/* ── Version Status ────────────────────────────── */}
            <div className="rounded-2xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-8">
                            <div>
                                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('update.versions.current')}</p>
                                <p className="text-2xl font-bold bg-gradient-to-r from-lime-400 to-green-500 bg-clip-text text-transparent">v{result?.currentVersion ?? '…'}</p>
                            </div>
                            {info && (
                                <div>
                                    <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('update.versions.latest')}</p>
                                    <p className={`text-2xl font-bold ${result?.updateAvailable ? 'text-lime-400' : 'text-green-400'}`}>v{info.version}{result?.updateAvailable ? ' ✨' : ''}</p>
                                </div>
                            )}
                        </div>
                        {result && !checking && (
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${result.updateAvailable ? 'bg-lime-500/15 text-lime-400' : result.success ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                                <Icon icon={result.updateAvailable ? Package : CheckCircle} size={12} />
                                {result.updateAvailable ? `Update available: v${info?.version}` : result.success ? "You're on the latest version" : `Check failed: ${result.error}`}
                            </div>
                        )}
                    </div>
                    <button onClick={handleCheck} disabled={checking}
                        className="shrink-0 px-4 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-black font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50">
                        <Icon icon={RefreshCw} size={15} className={checking ? 'animate-spin' : ''} />
                        {checking ? t('update.checking') : t('update.checkNow')}
                    </button>
                </div>
                {result?.lastChecked && (
                    <p className="text-xs mt-3 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Icon icon={Clock} size={11} /> {t('update.lastChecked')} {timeAgo(result.lastChecked)}{result.fromCache && ` ${t('update.cached')}`}
                    </p>
                )}
            </div>

            {/* ── Release Info + Download ───────────────────── */}
            {info && result?.updateAvailable && installState.phase === 'idle' && (
                <div className="rounded-2xl border p-5 space-y-4" style={{ background: 'var(--surface)', borderColor: 'rgba(132,204,22,0.35)' }}>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>What&apos;s new in v{info.version}</span>
                            {info.date && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-light)', color: 'var(--text-muted)' }}>{formatDate(info.date)}</span>}
                        </div>
                        {info.changelog && (
                            <ul className="space-y-1 mt-2">
                                {info.changelog.split('\n').filter(Boolean).map((line, i) => (
                                    <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
                                        <span className="text-lime-500 mt-0.5 shrink-0">•</span>
                                        <span>{line.replace(/^[-•]\s*/, '')}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {downloadState.phase === 'idle' && (
                        <button onClick={handleDownload} className="w-full py-3 rounded-xl bg-lime-500 hover:bg-lime-400 text-black font-bold flex items-center justify-center gap-2 transition-all text-sm">
                            <Icon icon={Download} size={16} />
                            {result.platform === 'macos' ? t('update.downloadMac') : t('update.downloadWin')}
                        </button>
                    )}

                    {isDownloading && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                                <span className="flex items-center gap-1.5">
                                    <Loader2 size={12} className="animate-spin" />
                                    {downloadState.phase === 'connecting' ? 'Connecting...' : downloadState.phase === 'verifying' ? 'Verifying SHA-256...' : `Downloading... ${formatBytes((downloadState as Extract<typeof downloadState, { phase: 'downloading' }>).downloadedSize ?? 0)} / ${formatBytes((downloadState as Extract<typeof downloadState, { phase: 'downloading' }>).totalSize ?? 0)}`}
                                </span>
                                {downloadState.phase === 'downloading' && <span className="font-mono font-bold text-lime-400">{downloadState.percent}%</span>}
                            </div>
                            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-light)' }}>
                                <div className="h-full bg-gradient-to-r from-lime-500 to-green-400 transition-all duration-300 rounded-full"
                                    style={{ width: downloadState.phase === 'connecting' ? '5%' : downloadState.phase === 'verifying' ? '100%' : downloadState.phase === 'downloading' ? `${downloadState.percent}%` : '50%' }} />
                            </div>
                            <button onClick={() => { abortRef.current?.abort(); setDownloadState({ phase: 'idle' }); }}
                                className="text-xs px-3 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
                        </div>
                    )}

                    {downloadState.phase === 'done' && (
                        <div className="rounded-xl border p-4 space-y-3" style={{ background: 'rgba(132,204,22,0.05)', borderColor: 'rgba(132,204,22,0.3)' }}>
                            <div className="flex items-center gap-2 text-lime-400 font-bold text-sm">
                                <Icon icon={CheckCircle} size={16} /> {t('update.download.complete')}
                                {downloadState.checksumVerified && <span className="ml-auto flex items-center gap-1 text-xs text-green-400 font-normal"><Icon icon={Shield} size={11} /> {t('update.download.verified')}</span>}
                            </div>
                            <p className="text-xs font-mono px-2 py-1.5 rounded-lg break-all" style={{ background: 'var(--surface-light)', color: 'var(--text-secondary)' }}>{downloadState.filePath}</p>
                            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd' }}>
                                🛡️ Your <code className="px-1">.skales-data/</code> and <code className="px-1">node_modules/</code> are NEVER deleted. A backup is created automatically before installing.
                                Optionally export data in <Link href="/settings#backup" className="underline">Settings → Backup</Link> first.
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => handleInstallNow(downloadState.filePath)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm" style={{ background: '#84cc16', color: 'black' }}>
                                    <Icon icon={Zap} size={14} /> {t('update.install.now')}
                                </button>
                                <button onClick={() => handleInstallLater(downloadState.filePath, info.version)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                                    <Icon icon={Clock} size={14} /> {t('update.install.later')}
                                </button>
                            </div>
                        </div>
                    )}

                    {downloadState.phase === 'error' && (
                        <div className="rounded-xl border p-4 space-y-2" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.3)' }}>
                            <div className="flex items-center gap-2 text-red-400 font-bold text-sm"><Icon icon={AlertCircle} size={16} /> {t('update.downloadFailed')}</div>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{downloadState.message}</p>
                            <div className="flex gap-2">
                                <button onClick={handleDownload} className="text-xs px-3 py-1.5 rounded-lg bg-lime-500 text-black font-semibold">{t('common.retry')}</button>
                                <a href="https://skales.app" target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                                    Download manually <Icon icon={ExternalLink} size={10} />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Install Progress ────────────────────────────── */}
            {(installState.phase === 'installing' || installState.phase === 'rollback') && (
                <div className="rounded-2xl border p-5 space-y-4" style={{ background: 'var(--surface)', borderColor: 'rgba(139,92,246,0.35)' }}>
                    <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Loader2 size={15} className="animate-spin text-purple-400" />
                        {installState.phase === 'rollback' ? t('update.rollingBack') : t('update.installingUpdate')}
                    </h3>
                    {installState.phase === 'installing' && (
                        <div className="space-y-2.5">
                            {installState.steps.map(step => (
                                <div key={step.step} className="flex items-start gap-3 text-sm">
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                        style={{
                                            background: step.status === 'done' ? 'rgba(132,204,22,0.2)' : step.status === 'running' ? 'rgba(139,92,246,0.2)' : step.status === 'error' ? 'rgba(239,68,68,0.2)' : 'var(--surface-light)',
                                            border: `1px solid ${step.status === 'done' ? 'rgba(132,204,22,0.4)' : step.status === 'running' ? 'rgba(139,92,246,0.4)' : step.status === 'error' ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                                        }}>
                                        {step.status === 'done' ? <span className="text-lime-400 text-xs">✓</span> :
                                            step.status === 'running' ? <Loader2 size={10} className="animate-spin text-purple-400" /> :
                                                step.status === 'error' ? <span className="text-red-400 text-xs">✗</span> :
                                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{step.step}</span>}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium" style={{ color: step.status === 'done' ? '#84cc16' : step.status === 'running' ? '#c084fc' : step.status === 'error' ? '#f87171' : 'var(--text-muted)' }}>
                                            {step.label}
                                        </p>
                                        {step.message && step.status !== 'pending' && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{step.message}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('update.doNotClose')}</p>
                </div>
            )}

            {/* ── Restart Countdown ────────────────────────── */}
            {installState.phase === 'restart' && (
                <div className="rounded-2xl border p-6 text-center space-y-3" style={{ background: 'rgba(132,204,22,0.06)', borderColor: 'rgba(132,204,22,0.4)' }}>
                    <div className="text-5xl font-black text-lime-400">{reloadCounter}s</div>
                    <p className="font-bold text-lime-400">{t('update.restartingMsg')}</p>
                    <button onClick={() => window.location.reload()} className="text-xs px-3 py-1.5 rounded-lg bg-lime-500 text-black font-bold">{t('update.reloadNow')}</button>
                </div>
            )}

            {/* ── Manual Restart ───────────────────────────── */}
            {installState.phase === 'manual_restart' && (
                <div className="rounded-2xl border p-5 space-y-3" style={{ background: 'rgba(132,204,22,0.06)', borderColor: 'rgba(132,204,22,0.4)' }}>
                    <p className="font-bold text-lime-400">✅ Update installed successfully!</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Close and reopen the Skales app to complete the update.</p>
                </div>
            )}

            {/* ── Install Error ─────────────────────────────── */}
            {installState.phase === 'error' && (
                <div className="rounded-2xl border p-5 space-y-3" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.3)' }}>
                    <div className="flex items-center gap-2 text-red-400 font-bold text-sm"><Icon icon={AlertCircle} size={16} /> {t('update.installFailed')}</div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{installState.message}</p>
                    {installState.rolledBack && <p className="text-xs text-green-400 flex items-center gap-1"><Icon icon={RotateCcw} size={12} /> Automatically rolled back to previous version.</p>}
                    <button onClick={() => setInstallState({ phase: 'idle' })} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>{t('update.dismiss')}</button>
                </div>
            )}

            {/* ── Already up to date ───────────────────────── */}
            {info && !result?.updateAvailable && installState.phase === 'idle' && (
                <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <Icon icon={CheckCircle} size={20} className="text-green-400 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>✅ You&apos;re on the latest version (v{result?.currentVersion})</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>No updates available at this time.</p>
                    </div>
                </div>
            )}

            {/* ── Previous Versions ────────────────────────── */}
            {info?.previous && info.previous.length > 0 && (
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={() => setPreviousExpanded(v => !v)} className="w-full flex items-center justify-between px-5 py-4" style={{ background: 'var(--surface)' }}>
                        <span className="flex items-center gap-2 font-semibold text-sm" style={{ color: 'var(--text-primary)' }}><Icon icon={Package} size={16} style={{ color: 'var(--text-muted)' }} /> 📦 {t('update.previous')}</span>
                        <Icon icon={previousExpanded ? ChevronDown : ChevronRight} size={16} style={{ color: 'var(--text-muted)' }} />
                    </button>
                    {previousExpanded && (
                        <div className="border-t divide-y" style={{ borderColor: 'var(--border)' }}>
                            {info.previous.map(pv => (
                                <div key={pv.version} className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--surface)' }}>
                                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>v{pv.version}{pv.date && <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(pv.date)}</span>}</span>
                                    <div className="flex items-center gap-2">
                                        {pv.windows && <a href={pv.windows} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Icon icon={Download} size={11} /> Windows</a>}
                                        {pv.macos && <a href={pv.macos} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}><Icon icon={Download} size={11} /> macOS</a>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Local Backups ────────────────────────────── */}
            {backups.length > 0 && (
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={() => setBackupsExpanded(v => !v)} className="w-full flex items-center justify-between px-5 py-4" style={{ background: 'var(--surface)' }}>
                        <span className="flex items-center gap-2 font-semibold text-sm" style={{ color: 'var(--text-primary)' }}><Icon icon={Archive} size={16} style={{ color: 'var(--text-muted)' }} /> 🗄️ {t('update.backups')} ({backups.length})</span>
                        <Icon icon={backupsExpanded ? ChevronDown : ChevronRight} size={16} style={{ color: 'var(--text-muted)' }} />
                    </button>
                    {backupsExpanded && (
                        <div className="border-t divide-y" style={{ borderColor: 'var(--border)' }}>
                            {backups.map(backup => (
                                <div key={backup.name} className="flex items-center justify-between px-5 py-3 gap-3" style={{ background: 'var(--surface)' }}>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>v{backup.version}</p>
                                        {backup.createdAt && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(backup.createdAt)}</p>}
                                    </div>
                                    <button onClick={() => handleInstallNow(backup.path)}
                                        className="text-xs px-3 py-1 rounded-lg border flex items-center gap-1 transition-all" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                                        <Icon icon={RotateCcw} size={11} /> {t('update.restore')}
                                    </button>
                                </div>
                            ))}
                            <div className="px-5 py-2 text-xs" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>
                                Stored in <code className="px-1 rounded" style={{ background: 'var(--surface-light)' }}>.skales-data/backups/</code>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Security Note ────────────────────────────── */}
            <div className="rounded-xl border px-4 py-3 flex items-start gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <Icon icon={Shield} size={15} className="text-blue-400 mt-0.5 shrink-0" />
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('update.security')} </span>
                    Updates fetched from <code className="px-1 rounded" style={{ background: 'var(--surface-light)' }}>skales.app</code> (hardcoded).
                    SHA-256 verified. <code className="px-1 rounded" style={{ background: 'var(--surface-light)' }}>.skales-data/</code> and <code className="px-1 rounded" style={{ background: 'var(--surface-light)' }}>node_modules/</code> are NEVER deleted.
                    Automatic backup before each install.
                </div>
            </div>

            <div className="text-center pb-2">
                <Link href="/settings#updates" className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>{t('update.updateSettings')}</Link>
            </div>
        </div>
    );
}
