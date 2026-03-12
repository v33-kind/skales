/**
 * /api/agent-sync — Skales v5 Multi-Agent Handshake & Task Delegation Protocol
 *
 * Allows remote Skales instances (or any agent that speaks this protocol)
 * to announce themselves, delegate tasks, and receive capability manifests.
 *
 * ─── Endpoints ────────────────────────────────────────────────────────────────
 *
 * GET  /api/agent-sync
 *   → Returns this agent's identity card and capability manifest.
 *   → Used for discovery: "Who are you and what can you do?"
 *
 * POST /api/agent-sync
 *   Body: AgentSyncRequest
 *   → Handles:
 *       type: "handshake"   — peer announces itself; returns this agent's card
 *       type: "delegate"    — remote agent delegates a task to this instance
 *       type: "status"      — request status of a previously delegated task
 *       type: "ping"        — simple liveness check
 *
 * ─── Security ─────────────────────────────────────────────────────────────────
 * Requests MUST include the header:
 *   X-Skales-Agent: <sharedSecret>
 * where sharedSecret is the value of SKALES_AGENT_SECRET env var (if set).
 * If SKALES_AGENT_SECRET is not set, agent-sync is open (localhost-only is assumed).
 */

import { NextResponse }               from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { loadSoul, loadHuman }         from '@/actions/identity';
import { createTask, getTask }         from '@/actions/tasks';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentCard {
    agentId:      string;
    name:         string;
    version:      string;
    protocol:     string;
    capabilities: string[];
    syncEndpoint: string;
    timestamp:    number;
}

type AgentSyncRequest =
    | { type: 'ping' }
    | { type: 'handshake'; from: AgentCard }
    | { type: 'delegate';  task: { title: string; description: string; priority?: 'low' | 'medium' | 'high' } }
    | { type: 'status';    taskId: string };

// ─── Auth helper ──────────────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
    const secret = process.env.SKALES_AGENT_SECRET;
    if (!secret) return true; // No secret configured → open
    const header = req.headers.get('x-skales-agent') ?? '';
    return header === secret;
}

// ─── Build this agent's identity card ─────────────────────────────────────────

async function buildAgentCard(reqUrl: string): Promise<AgentCard> {
    let agentName = 'Skales';
    let agentId   = 'skales-default';
    try {
        const soul  = await loadSoul();
        const human = await loadHuman();
        agentName   = human.name ? `Skales (${human.name}'s)` : 'Skales';
        agentId     = `skales-${(soul.createdAt ?? Date.now()).toString(36)}`;
    } catch { /* identity not yet bootstrapped */ }

    const origin = new URL(reqUrl).origin;

    return {
        agentId,
        name:         agentName,
        version:      '6.0.0',
        protocol:     'skales-agent-sync/1.0',
        capabilities: [
            'chat', 'task-delegation', 'web-search', 'file-read', 'file-write',
            'calendar', 'telegram', 'email', 'code-execution', 'image-generation',
            'network-scan', 'dlna-cast', 'custom-skills', 'autopilot',
        ],
        syncEndpoint: `${origin}/api/agent-sync`,
        timestamp:    Date.now(),
    };
}

// ─── GET /api/agent-sync ─────────────────────────────────────────────────────

export async function GET(req: Request) {
    noStore();
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const card = await buildAgentCard(req.url);
    return NextResponse.json({ ok: true, agent: card });
}

// ─── POST /api/agent-sync ────────────────────────────────────────────────────

export async function POST(req: Request) {
    noStore();
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: AgentSyncRequest;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const myCard = await buildAgentCard(req.url);

    switch (body.type) {

        // ── Ping ──────────────────────────────────────────────────────────────
        case 'ping': {
            return NextResponse.json({ ok: true, pong: true, agentId: myCard.agentId, timestamp: Date.now() });
        }

        // ── Handshake ─────────────────────────────────────────────────────────
        // A remote agent announces itself. We log it and reply with our own card.
        case 'handshake': {
            const peer = body.from;
            console.log(`[AgentSync] Handshake from "${peer?.name ?? '?'}" (${peer?.agentId ?? 'unknown'}) at ${peer?.syncEndpoint ?? '?'}`);
            return NextResponse.json({
                ok:    true,
                agent: myCard,
                message: `Hello from ${myCard.name}! Handshake accepted.`,
            });
        }

        // ── Delegate ─────────────────────────────────────────────────────────
        // A remote agent asks us to execute a task on its behalf.
        case 'delegate': {
            const { task } = body;
            if (!task?.title || !task?.description) {
                return NextResponse.json({ error: 'Missing task.title or task.description' }, { status: 400 });
            }
            try {
                const created = await createTask({
                    title:       `[DELEGATED] ${task.title}`,
                    description: task.description,
                    priority:    task.priority ?? 'medium',
                });
                console.log(`[AgentSync] Task delegated: "${task.title}" → id=${created.id}`);
                return NextResponse.json({
                    ok:     true,
                    taskId: created.id,
                    message: `Task "${task.title}" accepted and queued (id: ${created.id}).`,
                });
            } catch (err: any) {
                return NextResponse.json({ error: err.message ?? 'Failed to create task' }, { status: 500 });
            }
        }

        // ── Status ────────────────────────────────────────────────────────────
        // Check the status of a previously delegated task.
        case 'status': {
            const { taskId } = body;
            if (!taskId) {
                return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
            }
            try {
                const task = await getTask(taskId);
                if (!task) {
                    return NextResponse.json({ error: `Task "${taskId}" not found` }, { status: 404 });
                }
                return NextResponse.json({
                    ok:     true,
                    taskId: task.id,
                    status: task.status,
                    result: task.result ?? null,
                    error:  task.error  ?? null,
                });
            } catch (err: any) {
                return NextResponse.json({ error: err.message ?? 'Failed to retrieve task' }, { status: 500 });
            }
        }

        default:
            return NextResponse.json({ error: `Unknown request type: ${(body as any).type}` }, { status: 400 });
    }
}
