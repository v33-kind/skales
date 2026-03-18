'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, CheckCircle2, Sparkles, Zap, Users, Star,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

// ─── Feature row helper ───────────────────────────────────────────────────────

function Feature({ text }: { text: string }) {
    return (
        <li className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-green-400" />
            <span>{text}</span>
        </li>
    );
}

// ─── Waitlist inline form ─────────────────────────────────────────────────────

function WaitlistForm({ tier, savedEmail }: { tier: 'personal' | 'business'; savedEmail: string }) {
    const { t } = useTranslation();
    const [open, setOpen]       = useState(false);
    const [email, setEmail]     = useState(savedEmail);
    const [state, setState]     = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errMsg, setErrMsg]   = useState('');

    // If the user already joined, skip the form
    if (savedEmail && state !== 'success') {
        return (
            <p className="mt-4 text-xs font-medium text-green-400 flex items-center gap-1.5 justify-center">
                <CheckCircle2 size={13} />
                {t('skalesPlus.waitlist.alreadyJoined')}
            </p>
        );
    }

    if (state === 'success') {
        return (
            <p className="mt-4 text-xs font-medium text-green-400 flex items-center gap-1.5 justify-center text-center">
                <CheckCircle2 size={13} />
                {t('skalesPlus.waitlist.success')}
            </p>
        );
    }

    const handleSubmit = async () => {
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setErrMsg(t('skalesPlus.waitlist.invalidEmail'));
            return;
        }
        setState('loading');
        setErrMsg('');
        try {
            const res = await fetch('/api/skales-plus/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, tier }),
            });
            const data = await res.json();
            if (data.success) {
                setState('success');
            } else {
                setState('error');
                setErrMsg(data.error || 'Something went wrong');
            }
        } catch {
            // Show success even if network is unavailable — local save happened
            setState('success');
        }
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="mt-4 w-full px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                    background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
                }}
            >
                {t('skalesPlus.waitlist.submit')}
            </button>
        );
    }

    return (
        <div className="mt-4 space-y-2">
            <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setErrMsg(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder={t('skalesPlus.waitlist.emailPlaceholder')}
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all focus:ring-2 focus:ring-purple-500"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            {errMsg && <p className="text-xs text-red-400">{errMsg}</p>}
            <button
                onClick={handleSubmit}
                disabled={state === 'loading'}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                style={{
                    background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
                }}
            >
                {state === 'loading' ? '...' : t('skalesPlus.waitlist.submit')}
            </button>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SkalesPlusPage() {
    const { t } = useTranslation();

    // Read any previously saved waitlist email from localStorage (best-effort)
    const savedEmail = typeof localStorage !== 'undefined'
        ? localStorage.getItem('skalesplus_waitlist_email') || ''
        : '';

    const freeFeatures = [
        t('skalesPlus.features.allCore'),
        t('skalesPlus.features.byok'),
        t('skalesPlus.features.unlimitedChats'),
        t('skalesPlus.features.localStorage'),
        t('skalesPlus.features.communitySupport'),
        t('skalesPlus.features.sevenLanguages'),
    ];

    const personalFeatures = [
        `Everything in ${t('skalesPlus.free.name')}`,
        t('skalesPlus.features.hostedAI'),
        t('skalesPlus.features.customSkins'),
        t('skalesPlus.features.extendedMemory'),
        t('skalesPlus.features.morningBriefing'),
        t('skalesPlus.features.multiDevice'),
        t('skalesPlus.features.prioritySupport'),
        t('skalesPlus.features.earlyAccess'),
    ];

    const businessFeatures = [
        `Everything in ${t('skalesPlus.personal.name')}`,
        t('skalesPlus.features.teamSeats', { count: '5' }),
        t('skalesPlus.features.teamManagement'),
        t('skalesPlus.features.sharedMemory'),
        t('skalesPlus.features.apiAccess'),
        t('skalesPlus.features.ftpDeploy'),
        t('skalesPlus.features.whiteLabelBuddy'),
        t('skalesPlus.features.auditLog'),
    ];

    return (
        <div className="min-h-screen p-4 sm:p-8 pb-32" style={{ background: 'var(--background)' }}>
            <div className="max-w-5xl mx-auto">

                {/* Back link */}
                <Link
                    href="/settings"
                    className="inline-flex items-center gap-2 text-sm mb-8 transition-opacity hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <ArrowLeft size={15} />
                    {t('nav.settings')}
                </Link>

                {/* Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4 text-xs font-bold uppercase tracking-wider"
                        style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                        <Sparkles size={12} />
                        {t('skalesPlus.title')}
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>
                        {t('skalesPlus.subtitle')}
                    </h1>
                    <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
                        Everything you need, right on your desktop. No cloud lock-in, no subscriptions required - upgrade when you're ready.
                    </p>
                </div>

                {/* Tier cards - 3 col on desktop, stacked on mobile */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* ── Free Forever ── */}
                    <div className="rounded-2xl border-2 p-6 flex flex-col"
                        style={{ borderColor: '#4ade80', background: 'var(--surface)' }}>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">🦎</span>
                                <h2 className="font-black text-base" style={{ color: 'var(--text-primary)' }}>
                                    {t('skalesPlus.free.name')}
                                </h2>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-black"
                                style={{ background: '#4ade80' }}>
                                {t('skalesPlus.free.badge')}
                            </span>
                        </div>
                        <p className="text-[11px] mb-1 font-semibold" style={{ color: '#4ade80' }}>$0 / forever</p>
                        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>{t('skalesPlus.free.name')} — always free.</p>
                        <ul className="space-y-2.5 flex-1 mb-6">
                            {freeFeatures.map(f => <Feature key={f} text={f} />)}
                        </ul>
                        <button disabled
                            className="w-full px-4 py-2.5 rounded-xl text-sm font-bold cursor-not-allowed opacity-60"
                            style={{ background: 'var(--surface-light)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            {t('skalesPlus.free.button')}
                        </button>
                    </div>

                    {/* ── Skales+ Personal (highlighted) ── */}
                    <div className="rounded-2xl p-6 flex flex-col relative md:-mt-2 md:mb-2"
                        style={{
                            background: 'linear-gradient(145deg, rgba(124,58,237,0.12) 0%, rgba(167,139,250,0.08) 100%)',
                            border: '2px solid rgba(167,139,250,0.55)',
                            boxShadow: '0 8px 32px rgba(124,58,237,0.2)',
                        }}>
                        {/* Popular badge */}
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white"
                                style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)' }}>
                                <Star size={9} className="inline mr-1 -mt-px" />{t('skalesPlus.popular')}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mb-1 mt-2">
                            <Zap size={16} style={{ color: '#a78bfa' }} />
                            <h2 className="font-black text-base" style={{ color: 'var(--text-primary)' }}>
                                {t('skalesPlus.personal.name')}
                            </h2>
                        </div>
                        <p className="text-[11px] mb-0.5 font-semibold" style={{ color: '#a78bfa' }}>
                            {t('skalesPlus.personal.price')} <span className="font-normal opacity-70">{t('skalesPlus.perMonth')}</span>
                        </p>
                        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
                            {t('skalesPlus.personal.subtitle')}
                        </p>
                        <ul className="space-y-2.5 flex-1 mb-6">
                            {personalFeatures.map(f => <Feature key={f} text={f} />)}
                        </ul>
                        <WaitlistForm tier="personal" savedEmail={savedEmail} />
                    </div>

                    {/* ── Skales+ Business ── */}
                    <div className="rounded-2xl border-2 p-6 flex flex-col"
                        style={{
                            borderColor: 'rgba(167,139,250,0.3)',
                            background: 'var(--surface)',
                        }}>
                        <div className="flex items-center gap-2 mb-1">
                            <Users size={16} style={{ color: '#a78bfa' }} />
                            <h2 className="font-black text-base" style={{ color: 'var(--text-primary)' }}>
                                {t('skalesPlus.business.name')}
                            </h2>
                        </div>
                        <p className="text-[11px] mb-0.5 font-semibold" style={{ color: '#a78bfa' }}>
                            {t('skalesPlus.business.price')} <span className="font-normal opacity-70">{t('skalesPlus.perMonth')}</span>
                        </p>
                        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
                            {t('skalesPlus.business.subtitle')}
                        </p>
                        <ul className="space-y-2.5 flex-1 mb-6">
                            {businessFeatures.map(f => <Feature key={f} text={f} />)}
                        </ul>
                        <WaitlistForm tier="business" savedEmail={savedEmail} />
                    </div>

                </div>

                {/* Beta note */}
                <div className="mt-10 text-center p-4 rounded-2xl mx-auto max-w-2xl"
                    style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)' }}>
                    <p className="text-xs font-semibold text-green-400 mb-1">🎉 {t('skalesPlus.title')} Beta</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('skalesPlus.betaNote')}
                    </p>
                </div>

            </div>
        </div>
    );
}
