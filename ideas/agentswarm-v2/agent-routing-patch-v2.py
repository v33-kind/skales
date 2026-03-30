"""
================================================================================
AGENT ROUTING PATCH - Skales Agent Swarm
================================================================================

Author:     @v33-kind
Date:       2026-03-29
Context:    GitHub Discussion #34
Status:     REVIEW ONLY - All code is commented out. Nothing executes.

================================================================================
WHAT THIS FIXES
================================================================================

When a CEO agent dispatches subtasks to specialized agents via dispatch_subtasks,
the task.agent field is saved but executeTask() never reads it. Every subtask
runs with the default provider/model regardless of which agent was assigned.

The agent field is a ghost - it exists in the data structure, gets persisted
to JSON, shows up in the Tasks UI, but is completely ignored at execution time.

================================================================================
ROOT CAUSE
================================================================================

File: apps/web/src/actions/tasks.ts
Function: executeTask()
Line: ~261

    const decision = await agentDecide(messages, {
        signal: taskController.signal,
        callTimeoutMs,
    });

agentDecide() is called with NO provider, NO model, NO systemPrompt.
It falls back to the default active provider from settings.
The task.agent field is never consulted.

Meanwhile, agentDecide() already supports these options:

    export async function agentDecide(
        messages,
        options?: {
            provider?: Provider;
            model?: string;
            systemPrompt?: string;    // <-- exists, never passed from tasks
            signal?: AbortSignal;
            callTimeoutMs?: number;
        }
    )

And the agent definition already stores them:

    interface AgentDefinition {
        id: string;
        name: string;
        systemPrompt: string;         // <-- exists, never used in tasks
        model?: string;               // <-- exists, never used in tasks
        provider?: string;            // <-- exists, never used in tasks
        capabilities: string[];
        tools: string[];
    }

Everything is wired. The last connection is missing.

================================================================================
THE FIX - 4 CHANGES ACROSS 2 FILES
================================================================================

All code below is commented out. To apply, uncomment the relevant sections
and integrate into the target files. Each change is marked with its target
file and approximate line number.

--------------------------------------------------------------------------------
CHANGE 1 of 4
Target: apps/web/src/actions/tasks.ts
Location: Top of file, after existing imports (~line 10)
What: Import the agent lookup function
--------------------------------------------------------------------------------
"""

# --- CHANGE 1: Add import ---
# Add this line after the existing imports in tasks.ts:
#
# import { getAgent } from './agents';

"""
--------------------------------------------------------------------------------
CHANGE 2 of 4
Target: apps/web/src/actions/tasks.ts
Location: Inside executeTask(), after message history is built (~line 204)
          Before the while loop starts (~line 232)
What: Look up the assigned agent and build routing options
--------------------------------------------------------------------------------
"""

# --- CHANGE 2: Agent lookup + routing options ---
# Insert this block after the messages array is built (after line 203),
# before the while loop (before line 232):
#
# // ── Agent Routing ─────────────────────────────────────────────
# // If this task has an assigned agent, look up their definition
# // and use their provider, model, and system prompt instead of defaults.
# const assignedAgent = task.agent ? await getAgent(task.agent) : null;
# if (assignedAgent) {
#     logEntries.push({
#         timestamp: Date.now(),
#         message: `Routing to agent: ${assignedAgent.name} `
#               + `(${assignedAgent.provider || 'default'}`
#               + `/${assignedAgent.model || 'default'})`,
#         level: 'info'
#     });
# }
#
# // Build agent-specific options for agentDecide.
# // If no agent is assigned, these spread to nothing and defaults are used.
# // This is fully backward compatible.
# const agentRouting = {
#     ...(assignedAgent?.provider    && { provider: assignedAgent.provider }),
#     ...(assignedAgent?.model       && { model: assignedAgent.model }),
#     ...(assignedAgent?.systemPrompt && { systemPrompt: assignedAgent.systemPrompt }),
# };

"""
--------------------------------------------------------------------------------
CHANGE 3 of 4
Target: apps/web/src/actions/tasks.ts
Location: Inside the while loop, the agentDecide call (~line 261)
What: Pass agent routing options to agentDecide
--------------------------------------------------------------------------------
"""

# --- CHANGE 3: Update agentDecide call ---
# Replace the existing agentDecide call:
#
# BEFORE:
# const decision = await agentDecide(messages as any, {
#     signal: taskController.signal,
#     callTimeoutMs,
# });
#
# AFTER:
# const decision = await agentDecide(messages as any, {
#     signal: taskController.signal,
#     callTimeoutMs,
#     ...agentRouting,
# });

"""
--------------------------------------------------------------------------------
CHANGE 4 of 4
Target: apps/web/src/actions/orchestrator.ts
Location: dispatch_subtasks tool definition (~line 851)
What: Update the tool schema so the LLM knows it can assign agents
--------------------------------------------------------------------------------
"""

# --- CHANGE 4: Update tool schema ---
# In the dispatch_subtasks tool definition, update the subtasks_json description
# to include the optional agent field:
#
# BEFORE:
# description: 'JSON array of sub-task objects. Each object must have: '
#            + 'title (string), description (string, detailed instructions '
#            + 'for the agent), priority ("low"|"medium"|"high"). '
#            + 'Example: [{"title":"Landing Page: Product A",'
#            + '"description":"Create a landing page HTML file...",'
#            + '"priority":"high"}]'
#
# AFTER:
# description: 'JSON array of sub-task objects. Each object must have: '
#            + 'title (string), description (string, detailed instructions '
#            + 'for the agent), priority ("low"|"medium"|"high"). '
#            + 'Optional: agent (string, ID of a custom agent to execute '
#            + 'this subtask - uses that agent\'s provider, model, and '
#            + 'system prompt). Example: [{"title":"Code review",'
#            + '"description":"Review the auth module...",'
#            + '"priority":"high","agent":"code_assistant"}]'

"""
================================================================================
WHY THIS WORKS
================================================================================

1. AgentDefinition already stores provider, model, systemPrompt per agent
2. SubTaskData already has an agent field
3. dispatchMultiAgent() already passes agent to createTask()
4. agentDecide() already accepts provider, model, systemPrompt as options
5. getAgent() already exists as a lookup function

The only missing piece is executeTask() reading task.agent and passing it
through. That's what these 4 changes do.

================================================================================
BACKWARD COMPATIBILITY
================================================================================

- If task.agent is not set (most existing tasks), agentRouting spreads to
  nothing. agentDecide() uses defaults as before. Zero behavior change.

- If task.agent is set but the agent has no custom provider/model, the
  spread produces nothing for those fields. Defaults are used. Only the
  systemPrompt changes, which is the minimum useful improvement.

- No new dependencies. No schema changes. No database migration.
  No new API endpoints. No UI changes required.

================================================================================
TESTING
================================================================================

1. Create 2+ custom agents with DIFFERENT providers
   (e.g., Agent A on OpenRouter, Agent B on Ollama)

2. Start a chat with a "manager" agent

3. Type: "Start a multi-task job. Assign 'write a blog post' to Agent A
   and 'review code' to Agent B."

4. Check the Tasks tab:
   - Each subtask should show the assigned agent name
   - Execution logs should show "Routing to agent: [name] ([provider]/[model])"

5. Verify each subtask used the correct provider
   (visible in the execution log entries)

6. Test backward compatibility:
   - Create a task WITHOUT assigning an agent
   - Verify it still uses the default provider as before

================================================================================
WHAT THIS ENABLES
================================================================================

1. snakedev's use case: CEO agent delegates to 20+ specialized agents,
   each with their own codex-lb instance, model, and system prompt

2. Provider routing: Agent A uses OpenRouter, Agent B uses Ollama,
   Agent C uses a custom endpoint. Subtasks route correctly.

3. System prompt specialization: The code agent gets its code-focused
   prompt, the writer gets its writing prompt. No more generic output.

4. Foundation for Agent Swarm: Once tasks route to the right agents,
   the visual workspace can show live delegation chains.

================================================================================
ADDITIONAL ENHANCEMENTS - FULL SUGGESTED CODE
================================================================================

5 additional improvements that extend the agent routing fix.
Each includes root cause, suggested code, and integration notes.
All code is commented out for review only.

--------------------------------------------------------------------------------
ENHANCEMENT 1 of 5: Per-Agent Tool Filtering
--------------------------------------------------------------------------------

Problem: Every agent gets access to every tool (file ops, email, web search,
code execution, etc.). A content writer agent shouldn't have access to
delete_file or execute_command. The capabilities field exists on
AgentDefinition but is never used to filter available tools.

Target: apps/web/src/actions/orchestrator.ts
Location: Where tools are assembled for agentDecide (~line 4830+)
"""

# --- ENHANCEMENT 1: Tool filtering by agent capabilities ---
#
# AgentDefinition already has:
#   capabilities: string[]  // e.g. ['code-generation', 'debugging']
#   tools: string[]          // e.g. ['file_read', 'file_write', 'web_search']
#
# The orchestrator builds a tools array around line 800-860.
# After the agent routing lookup in executeTask(), filter tools
# based on the agent's capabilities/tools list.
#
# Insert this after the agentRouting block in executeTask() (Change 2):
#
# // ── Tool Filtering ─────────────────────────────────────────
# // If the assigned agent has a tools whitelist, filter available
# // tools to only those listed. This prevents a writer agent from
# // executing code or a code agent from sending emails.
# let toolFilter: string[] | null = null;
# if (assignedAgent?.tools?.length) {
#     toolFilter = assignedAgent.tools;
#     logEntries.push({
#         timestamp: Date.now(),
#         message: `Tool filter active: ${toolFilter.join(', ')}`,
#         level: 'info'
#     });
# }
#
# // Then modify the agentDecide call to pass the filter:
# const decision = await agentDecide(messages as any, {
#     signal: taskController.signal,
#     callTimeoutMs,
#     ...agentRouting,
#     toolFilter,  // NEW: pass to agentDecide
# });
#
# ---------------------------------------------------------------
# In orchestrator.ts, agentDecide() needs to accept toolFilter:
# ---------------------------------------------------------------
#
# export async function agentDecide(
#     messages: { role: string; content: string }[],
#     options?: {
#         provider?: Provider;
#         model?: string;
#         systemPrompt?: string;
#         forceVision?: boolean;
#         noTools?: boolean;
#         signal?: AbortSignal;
#         callTimeoutMs?: number;
#         toolFilter?: string[] | null;  // NEW
#     }
# )
#
# Then where the tools array is built (before the API call):
#
# let availableTools = buildToolDefinitions(); // existing function
#
# // Filter tools if agent has a whitelist
# if (options?.toolFilter?.length) {
#     availableTools = availableTools.filter(
#         tool => options.toolFilter!.includes(tool.function.name)
#     );
# }

"""
--------------------------------------------------------------------------------
ENHANCEMENT 2 of 5: Per-Agent Custom Base URL
--------------------------------------------------------------------------------

Problem: The 'custom' provider type uses a single baseUrl from settings
(settings.providers.custom.baseUrl). Users like snakedev run 3 different
codex-lb instances and want each agent to connect to a different one.
Currently impossible - all custom agents share one endpoint.

Target: apps/web/src/actions/agents.ts (interface)
        apps/web/src/actions/orchestrator.ts (provider resolution)
"""

# --- ENHANCEMENT 2: Per-agent custom base URL ---
#
# Step 1: Extend AgentDefinition with optional baseUrl
#
# In agents.ts, update the interface:
#
# export interface AgentDefinition {
#     id: string;
#     name: string;
#     description: string;
#     emoji: string;
#     systemPrompt: string;
#     model?: string;
#     provider?: string;
#     baseUrl?: string;        // NEW: custom endpoint URL for this agent
#     apiKey?: string;         // NEW: optional per-agent API key
#     capabilities: string[];
#     tools: string[];
#     createdAt: number;
#     lastUsed?: number;
# }
#
# Step 2: In orchestrator.ts agentDecide(), accept and use baseUrl
#
# Add to options interface:
#
# export async function agentDecide(
#     messages,
#     options?: {
#         provider?: Provider;
#         model?: string;
#         systemPrompt?: string;
#         baseUrl?: string;     // NEW
#         apiKey?: string;      // NEW
#         // ... existing fields
#     }
# )
#
# Then where the provider config is resolved (~line 4823):
#
# const providerConfig = { ...settings.providers[provider] };
# if (options?.model) {
#     providerConfig.model = options.model;
# }
# // NEW: Override base URL if agent specifies one
# if (options?.baseUrl) {
#     providerConfig.baseUrl = options.baseUrl;
# }
# // NEW: Override API key if agent specifies one
# if (options?.apiKey) {
#     providerConfig.apiKey = options.apiKey;
# }
#
# Step 3: In executeTask(), pass baseUrl from agent definition
#
# Update the agentRouting object (Change 2 from main patch):
#
# const agentRouting = {
#     ...(assignedAgent?.provider     && { provider: assignedAgent.provider }),
#     ...(assignedAgent?.model        && { model: assignedAgent.model }),
#     ...(assignedAgent?.systemPrompt && { systemPrompt: assignedAgent.systemPrompt }),
#     ...(assignedAgent?.baseUrl      && { baseUrl: assignedAgent.baseUrl }),    // NEW
#     ...(assignedAgent?.apiKey       && { apiKey: assignedAgent.apiKey }),      // NEW
# };
#
# Step 4: Update the agent creation UI to include baseUrl field
#
# In apps/web/src/app/agents/page.tsx, add an input field:
#
# <label>Custom Endpoint URL (optional)</label>
# <input
#     placeholder="e.g. http://localhost:5001/v1"
#     value={agent.baseUrl || ''}
#     onChange={e => setAgent({...agent, baseUrl: e.target.value})}
# />
#
# This enables snakedev's setup:
#   Agent "Code Assistant"  -> baseUrl: "http://localhost:5001/v1" (codex-lb #1)
#   Agent "Content Writer"  -> baseUrl: "http://localhost:5002/v1" (codex-lb #2)
#   Agent "Data Analyst"    -> baseUrl: "http://localhost:5003/v1" (codex-lb #3)

"""
--------------------------------------------------------------------------------
ENHANCEMENT 3 of 5: Agent-to-Agent Result Passing
--------------------------------------------------------------------------------

Problem: When a CEO delegates 3 subtasks, each runs independently. Agent B
cannot see what Agent A produced. Results are saved to the task JSON but
not fed back into the delegation chain. The CEO has to manually check
each result.

Target: apps/web/src/actions/tasks.ts (dispatchMultiAgent, executeTask)
"""

# --- ENHANCEMENT 3: Result passing between agents ---
#
# Approach: After all subtasks in a multi-agent job complete, compile
# their results and feed them back to the parent task's message history.
# The CEO agent can then summarize or act on combined results.
#
# Step 1: Add a result compilation function in tasks.ts
#
# export async function compileSubtaskResults(
#     parentId: string
# ): Promise<string> {
#     const parent = await getTask(parentId);
#     if (!parent?.subtaskIds?.length) return 'No subtasks found.';
#
#     const results: string[] = [];
#     for (const subId of parent.subtaskIds) {
#         const sub = await getTask(subId);
#         if (!sub) continue;
#         const agentName = sub.agent || 'default';
#         const status = sub.status;
#         const result = sub.result || sub.error || 'No output';
#         results.push(
#             `--- ${sub.title} (${agentName}) [${status}] ---\n${result}`
#         );
#     }
#
#     return results.join('\n\n');
# }
#
# Step 2: In dispatchMultiAgent(), after all subtasks complete,
# update the parent task with compiled results
#
# In the execAll() function (~line 455), after the Promise resolves:
#
# // After all subtasks finish, compile results into parent
# const compiledResults = await compileSubtaskResults(parentTask.id);
# await updateTask(parentTask.id, {
#     status: 'completed',
#     completedAt: Date.now(),
#     result: compiledResults,
#     logs: [
#         ...parentTask.logs,
#         {
#             timestamp: Date.now(),
#             message: `All ${createdSubtasks.length} subtasks completed. Results compiled.`,
#             level: 'info'
#         }
#     ]
# });
#
# Step 3: Optional - Auto-resume CEO agent with results
#
# If the parent task was dispatched from a chat conversation,
# inject the compiled results back into the chat:
#
# // After compilation, if the task originated from chat:
# if (parent.sourceConversationId) {
#     const summaryMessage = {
#         role: 'system',
#         content: `Multi-agent job completed. Results from ${parent.subtaskIds.length} agents:\n\n`
#                + compiledResults
#     };
#     // Append to the conversation so the CEO can summarize
#     await appendMessageToConversation(
#         parent.sourceConversationId,
#         summaryMessage
#     );
# }

"""
--------------------------------------------------------------------------------
ENHANCEMENT 4 of 5: Delegation Chain Visualization
--------------------------------------------------------------------------------

Problem: When 20+ agents delegate tasks to each other, there's no way to
see the flow. The Tasks tab shows a flat list. The Agent Swarm page shows
static connections. Neither shows live delegation chains.

Target: apps/web/src/app/api/local-swarm/route.ts (new endpoint)
        apps/web/src/actions/tasks.ts (add chain data)
"""

# --- ENHANCEMENT 4: Delegation chain data for visualization ---
#
# Step 1: Add a function to build the delegation chain from task data
#
# In tasks.ts:
#
# export async function getDelegationChain(): Promise<{
#     nodes: Array<{
#         id: string;
#         type: 'agent' | 'task';
#         name: string;
#         status: string;
#         agent?: string;
#         provider?: string;
#     }>;
#     edges: Array<{
#         from: string;
#         to: string;
#         type: 'delegated' | 'assigned' | 'completed';
#     }>;
# }> {
#     const allTasks = await listTasks(100);
#     const agents = await listAgents();
#     const nodes: any[] = [];
#     const edges: any[] = [];
#
#     // Add agent nodes
#     agents.forEach(a => {
#         nodes.push({
#             id: a.id,
#             type: 'agent',
#             name: a.name,
#             status: 'online',
#             provider: a.provider || 'default',
#         });
#     });
#
#     // Add task nodes and edges
#     allTasks.forEach(t => {
#         nodes.push({
#             id: t.id,
#             type: 'task',
#             name: t.title,
#             status: t.status,
#             agent: t.agent,
#         });
#
#         // Edge: agent -> task (assignment)
#         if (t.agent) {
#             edges.push({
#                 from: t.agent,
#                 to: t.id,
#                 type: t.status === 'completed' ? 'completed' : 'assigned',
#             });
#         }
#
#         // Edge: parent -> subtask (delegation)
#         if (t.parentId) {
#             edges.push({
#                 from: t.parentId,
#                 to: t.id,
#                 type: 'delegated',
#             });
#         }
#     });
#
#     return { nodes, edges };
# }
#
# Step 2: Expose via API route
#
# Create apps/web/src/app/api/delegation-chain/route.ts:
#
# import { getDelegationChain } from '@/actions/tasks';
# import { NextResponse } from 'next/server';
#
# export async function GET() {
#     try {
#         const chain = await getDelegationChain();
#         return NextResponse.json(chain);
#     } catch (error) {
#         return NextResponse.json(
#             { error: 'Failed to build delegation chain' },
#             { status: 500 }
#         );
#     }
# }
#
# Step 3: The Agent Swarm visual workspace polls this endpoint
# and renders the live delegation graph. The workspace prototype
# in agent-swarm-v2.html demonstrates the UI for this.

"""
--------------------------------------------------------------------------------
ENHANCEMENT 5 of 5: Agent Availability Checks
--------------------------------------------------------------------------------

Problem: If an agent's provider is offline (codex-lb instance crashed,
Ollama not running, API key expired), the subtask fails silently after
a timeout. No pre-check, no fallback, no reassignment.

Target: apps/web/src/actions/agents.ts (health check)
        apps/web/src/actions/tasks.ts (pre-execution check)
"""

# --- ENHANCEMENT 5: Agent availability checks ---
#
# Step 1: Add a health check function in agents.ts
#
# export async function checkAgentAvailability(
#     agentId: string
# ): Promise<{
#     available: boolean;
#     provider: string;
#     latencyMs?: number;
#     error?: string;
# }> {
#     const agent = await getAgent(agentId);
#     if (!agent) return { available: false, provider: 'unknown', error: 'Agent not found' };
#
#     const settings = await loadSettings();
#     const provider = agent.provider || settings.activeProvider;
#     const providerConfig = settings.providers[provider];
#
#     if (!providerConfig) {
#         return { available: false, provider, error: 'Provider not configured' };
#     }
#
#     // For custom endpoints, ping the base URL
#     if (provider === 'custom') {
#         const baseUrl = agent.baseUrl || providerConfig.baseUrl;
#         if (!baseUrl) {
#             return { available: false, provider, error: 'No base URL configured' };
#         }
#         try {
#             const start = Date.now();
#             const response = await fetch(`${baseUrl}/models`, {
#                 signal: AbortSignal.timeout(5000),
#                 headers: providerConfig.apiKey
#                     ? { 'Authorization': `Bearer ${providerConfig.apiKey}` }
#                     : {},
#             });
#             const latencyMs = Date.now() - start;
#             return {
#                 available: response.ok,
#                 provider,
#                 latencyMs,
#                 error: response.ok ? undefined : `HTTP ${response.status}`,
#             };
#         } catch (e: any) {
#             return { available: false, provider, error: e.message };
#         }
#     }
#
#     // For cloud providers, check if API key exists
#     if (!providerConfig.apiKey && provider !== 'ollama') {
#         return { available: false, provider, error: 'No API key configured' };
#     }
#
#     // For Ollama, ping the local server
#     if (provider === 'ollama') {
#         try {
#             const baseUrl = providerConfig.baseUrl || 'http://localhost:11434';
#             const start = Date.now();
#             const response = await fetch(`${baseUrl}/api/tags`, {
#                 signal: AbortSignal.timeout(3000),
#             });
#             const latencyMs = Date.now() - start;
#             return { available: response.ok, provider, latencyMs };
#         } catch (e: any) {
#             return { available: false, provider, error: e.message };
#         }
#     }
#
#     // Cloud providers with API keys - assume available
#     return { available: true, provider };
# }
#
# Step 2: Pre-check in executeTask() before running
#
# Insert after the agent lookup (Change 2), before the while loop:
#
# // ── Availability Check ──────────────────────────────────────
# if (assignedAgent) {
#     const health = await checkAgentAvailability(assignedAgent.id);
#     if (!health.available) {
#         logEntries.push({
#             timestamp: Date.now(),
#             message: `Agent "${assignedAgent.name}" unavailable: ${health.error}. `
#                    + `Falling back to default provider.`,
#             level: 'warn'
#         });
#         // Clear agent routing so defaults are used
#         agentRouting = {};
#     } else if (health.latencyMs) {
#         logEntries.push({
#             timestamp: Date.now(),
#             message: `Agent "${assignedAgent.name}" available `
#                    + `(${health.provider}, ${health.latencyMs}ms latency)`,
#             level: 'info'
#         });
#     }
# }
#
# Step 3: Optional - Expose health status via API for the workspace
#
# Create apps/web/src/app/api/agent-health/route.ts:
#
# import { listAgents, checkAgentAvailability } from '@/actions/agents';
# import { NextResponse } from 'next/server';
#
# export async function GET() {
#     const agents = await listAgents();
#     const health = await Promise.all(
#         agents.map(async (a) => ({
#             id: a.id,
#             name: a.name,
#             ...(await checkAgentAvailability(a.id)),
#         }))
#     );
#     return NextResponse.json(health);
# }
#
# The Agent Swarm workspace can poll /api/agent-health every 30s
# and update node status dots (green/red) in real time.

"""
================================================================================
BUG FIXES - SUGGESTED CODE
================================================================================

Bugs reported in Discussion #34 with suggested fixes.
All code is commented out for review only.

--------------------------------------------------------------------------------
BUG FIX 1: Port 3000 Conflict (US-7)
--------------------------------------------------------------------------------

Problem: If another service is running on port 3000, Skales starts
silently and displays the other service's UI. No error, no fallback.

Target: electron/main.js (port detection logic)
"""

# --- BUG FIX 1: Port conflict detection ---
#
# The Electron main process should check port availability before
# spawning the Next.js server. If port 3000 is taken, try 3001-3009.
#
# In electron/main.js, before starting the Next.js server:
#
# const net = require('net');
#
# async function findAvailablePort(startPort = 3000, maxAttempts = 10) {
#     for (let port = startPort; port < startPort + maxAttempts; port++) {
#         const available = await new Promise((resolve) => {
#             const server = net.createServer();
#             server.once('error', () => resolve(false));
#             server.once('listening', () => {
#                 server.close();
#                 resolve(true);
#             });
#             server.listen(port, '127.0.0.1');
#         });
#         if (available) return port;
#     }
#     return null;  // All ports taken
# }
#
# // Usage before server start:
# const port = await findAvailablePort(3000);
# if (!port) {
#     dialog.showErrorBox(
#         'Skales - Port Conflict',
#         'Ports 3000-3009 are all in use. Please close other services and try again.'
#     );
#     app.quit();
#     return;
# }
#
# // Log which port was selected
# console.log(`Skales starting on port ${port}`);
# process.env.PORT = String(port);
#
# // If not default port, show notification
# if (port !== 3000) {
#     new Notification({
#         title: 'Skales',
#         body: `Port 3000 was in use. Running on port ${port} instead.`
#     }).show();
# }

"""
--------------------------------------------------------------------------------
BUG FIX 2: Lio AI Input Box Freezes After Build (US-8)
--------------------------------------------------------------------------------

Problem: After a Lio AI build completes, the input box stops accepting
text after a couple of follow-up attempts. Requires app restart.

Target: apps/web/src/app/code/page.tsx (or equivalent Lio AI page)
Root cause: Likely the build completion handler sets a state flag
(e.g. isBuilding = false) but doesn't properly reset the input
handler or the message submission state gets stuck.
"""

# --- BUG FIX 2: Input box freeze ---
#
# Common cause: The build process uses a state variable like
# `isProcessing` or `isBuilding` that gates the input submission.
# If the build throws an error or the completion handler doesn't
# fire, the gate stays closed permanently.
#
# Suggested fix pattern:
#
# // In the Lio AI page component, find the build completion handler.
# // Ensure it ALWAYS resets input state, even on error:
#
# const handleBuildComplete = async (result: any) => {
#     try {
#         // ... process build result
#         setBuildResult(result);
#     } catch (error) {
#         console.error('Build completion error:', error);
#     } finally {
#         // ALWAYS reset - this is the critical line
#         setIsProcessing(false);
#         setIsBuilding(false);
#         setInputDisabled(false);
#
#         // Force re-enable the input element directly as a safety net
#         const inputEl = document.querySelector('[data-lio-input]');
#         if (inputEl) {
#             (inputEl as HTMLTextAreaElement).disabled = false;
#             (inputEl as HTMLTextAreaElement).focus();
#         }
#     }
# };
#
# // Also add a safety timeout - if the build takes longer than
# // maxBuildSteps * timeout, force-reset the input:
#
# useEffect(() => {
#     if (!isBuilding) return;
#     const safetyTimeout = setTimeout(() => {
#         if (isBuilding) {
#             console.warn('Lio AI: Build safety timeout - resetting input');
#             setIsBuilding(false);
#             setIsProcessing(false);
#             setInputDisabled(false);
#         }
#     }, 10 * 60 * 1000);  // 10 minute safety net
#     return () => clearTimeout(safetyTimeout);
# }, [isBuilding]);

"""
--------------------------------------------------------------------------------
BUG FIX 3: Autopilot Says File Created But Nothing Saved (US-9)
--------------------------------------------------------------------------------

Problem: Autopilot tasks report "file created" in the result but no
file exists on disk. The agent may be hallucinating tool execution
or sandbox mode is blocking writes silently.

Target: apps/web/src/actions/orchestrator.ts (tool execution)
        apps/web/src/lib/autonomous-runner.ts (result verification)
"""

# --- BUG FIX 3: Verify file operations actually executed ---
#
# Two potential causes and fixes:
#
# CAUSE A: Agent hallucinates tool call without actually calling it.
# The LLM says "I created the file" in its response text, but never
# issued a create_file tool call. The response is treated as success.
#
# Fix A: In the autonomous runner, after task completion, verify
# that claimed file operations actually produced files:
#
# // In autonomous-runner.ts, after task completes successfully:
#
# async function verifyTaskOutput(task: AgentTask, result: string): Promise<{
#     verified: boolean;
#     issues: string[];
# }> {
#     const issues: string[] = [];
#
#     // Check if result mentions file creation
#     const filePatterns = [
#         /created?\s+(?:file|document)\s+[`"']?([^\s`"']+)/gi,
#         /saved?\s+(?:to|as)\s+[`"']?([^\s`"']+)/gi,
#         /wrote\s+[`"']?([^\s`"']+)/gi,
#     ];
#
#     const claimedFiles: string[] = [];
#     for (const pattern of filePatterns) {
#         let match;
#         while ((match = pattern.exec(result)) !== null) {
#             claimedFiles.push(match[1]);
#         }
#     }
#
#     // Verify each claimed file exists
#     for (const filePath of claimedFiles) {
#         const fullPath = path.resolve(DATA_DIR, 'workspace', filePath);
#         if (!fs.existsSync(fullPath)) {
#             issues.push(`Claimed file not found: ${filePath}`);
#         }
#     }
#
#     return {
#         verified: issues.length === 0,
#         issues,
#     };
# }
#
# // Usage after task completion:
# const verification = await verifyTaskOutput(task, result);
# if (!verification.verified) {
#     logEntries.push({
#         timestamp: Date.now(),
#         message: `Verification failed: ${verification.issues.join(', ')}`,
#         level: 'warn'
#     });
#     // Optionally mark as failed instead of completed
#     await updateTask(task.id, {
#         status: 'failed',
#         error: `Output verification failed: ${verification.issues.join('; ')}`,
#     });
# }
#
# CAUSE B: Sandbox mode blocks the write silently.
# The tool call executes but the file system sandbox prevents the write
# without throwing an error visible to the agent.
#
# Fix B: In the file operation tools, check sandbox mode BEFORE attempting
# and return a clear error to the agent:
#
# // In the create_file / write_file tool handler:
#
# async function handleFileWrite(targetPath: string, content: string) {
#     const settings = await loadSettings();
#     const sandboxMode = settings.fileAccessMode || 'workspace_only';
#
#     // Check if the target path is allowed by sandbox
#     const resolved = path.resolve(targetPath);
#     const workspaceDir = path.join(DATA_DIR, 'workspace');
#
#     if (sandboxMode === 'workspace_only' && !resolved.startsWith(workspaceDir)) {
#         return {
#             success: false,
#             error: `Sandbox mode: File write blocked. Path "${targetPath}" is outside `
#                  + `the workspace directory. Change Settings > File Access Mode to `
#                  + `allow writes outside workspace.`,
#         };
#     }
#
#     // Proceed with write
#     try {
#         fs.mkdirSync(path.dirname(resolved), { recursive: true });
#         fs.writeFileSync(resolved, content, 'utf-8');
#         // Verify the write actually succeeded
#         if (!fs.existsSync(resolved)) {
#             return { success: false, error: 'File write appeared to succeed but file not found on disk.' };
#         }
#         return { success: true, path: resolved };
#     } catch (e: any) {
#         return { success: false, error: `File write failed: ${e.message}` };
#     }
# }

"""
================================================================================
REFERENCES
================================================================================

Discussion #34: https://github.com/skalesapp/skales/discussions/34
Agent Swarm Proposal: https://github.com/v33-kind/skales/tree/ideas

Files referenced:
  - apps/web/src/actions/tasks.ts (executeTask, dispatchMultiAgent)
  - apps/web/src/actions/orchestrator.ts (agentDecide, dispatch_subtasks)
  - apps/web/src/actions/agents.ts (getAgent, AgentDefinition)
  - apps/web/src/lib/agent-tasks.ts (AgentTask interface)

================================================================================

@v33-kind | kind. curious. clauding.

================================================================================
"""
