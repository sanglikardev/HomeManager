// HomeManager as a connector for the Claude app (a remote MCP server, Streamable HTTP, JSON replies).
// URL: /mcp/<key>, where the key is the account's personal key from Homie settings (a session token
// made by hm_homie_siri_key). Claude does the talking on the person's own Claude plan; these tools
// read and write Homie's data with the same functions the app uses.

import { runTool, TOOLS, type HomieContext, type Notify, type Rpc } from './homie';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const MCP_INSTRUCTIONS = `HomeManager is this person's household app, and these tools are their personal assistant "Homie".
Call get_overview at the start of a conversation (and before planning or filing anything time-based): it gives their local time, routine, settings (name, tone, goals in "about"), reminders, things to remember, busy days, and the shared home data (habits, to-dos, bills, plans, shopping).
- Speak in the tone in settings.tone: gentle, firm (direct, holds them to commitments) or drill (blunt, never insulting). Keep replies short; they are often on the move.
- Anything with a time: add_reminder, with LOCAL time YYYY-MM-DDTHH:MM worked out from overview.now. The app sends it as a phone notification.
- Lasting facts about their life: remember (check the overview first to avoid duplicates). Ideas and journal: save_note. Heavy work days: mark_busy, without work details.
- Household: add_todo, add_shopping, log_expense (rupees), log_habit (habit id from the overview).
- Routine changes (wake time, office days, tone, briefs, nudges): update_settings. Interests the daily scout watches: update_interests.
- More data on request: lookup (plans with checklists, to-dos, upkeep, bills, documents, habit history, their expenses, everything saved before). Trips and events: add_plan, add_plan_tasks, tick_plan_tasks. Done to-dos: complete_todo.
- Things you found on the web for them: save_find (so they aren't repeated). Interrupt them with notify only when it's worth it.
- Confirm briefly what you saved. Don't file small talk. For pain or injury, suggest a doctor or physio; never diagnose.`;

const OVERVIEW_TOOL = {
  name: 'get_overview',
  description: "Their local time, routine and settings, open reminders, facts, notes, busy days, and the home's habits, to-dos, bills due, plans and shopping list. Call this first.",
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

export function mcpTools() {
  return [
    OVERVIEW_TOOL,
    ...TOOLS.map((t) => {
      const tool = t as { name: string; description?: string; input_schema: unknown };
      return { name: tool.name, description: tool.description ?? '', inputSchema: tool.input_schema };
    }),
  ];
}

interface RpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const reply = (id: RpcMessage['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const failure = (id: RpcMessage['id'], code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

// Handles one JSON-RPC message. Returns null for notifications (no reply).
export async function handleMcp(msg: RpcMessage, key: string, rpc: Rpc, notify?: Notify): Promise<object | null> {
  if (msg.id === undefined || msg.id === null) return null; // notification
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      return reply(msg.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: {} },
        serverInfo: { name: 'homemanager', title: 'HomeManager (Homie)', version: '1.0.0' },
        instructions: MCP_INSTRUCTIONS,
      });
    }
    case 'ping':
      return reply(msg.id, {});
    case 'tools/list':
      return reply(msg.id, { tools: mcpTools() });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      let ctx: HomieContext;
      try {
        ctx = (await rpc('hm_homie_context', { p_token: key })) as unknown as HomieContext;
      } catch (e) {
        const signedOut = e instanceof Error && /sign in again/i.test(e.message);
        return reply(msg.id, text(signedOut ? 'This connector key no longer works. Make a new one in HomeManager > Homie > settings and update the connector URL.' : 'HomeManager is not reachable right now.', true));
      }
      if (name === 'get_overview') {
        const { chat: _chat, ...rest } = ctx;
        return reply(msg.id, text(JSON.stringify(rest)));
      }
      if (!TOOLS.some((t) => (t as { name: string }).name === name)) return failure(msg.id, -32602, `Unknown tool: ${name}`);
      try {
        const out = await runTool(name, args, ctx, key, rpc, notify);
        return reply(msg.id, text(out.action ? `${out.result}. Saved: ${out.action.label}` : out.result, !!out.error));
      } catch (e) {
        return reply(msg.id, text(`Failed: ${e instanceof Error ? e.message : String(e)}`, true));
      }
    }
    default:
      return failure(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// The HTTP side: POST a message (or a batch); GET is not offered (no server-initiated stream).
export async function mcpHttp(req: Request, key: string, rpc: Rpc, notify?: Notify): Promise<Response> {
  if (req.method === 'GET' || req.method === 'DELETE') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!/^[0-9a-f]{48}$/.test(key)) return Response.json(failure(null, -32001, 'Bad connector key'), { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(failure(null, -32700, 'Parse error'), { status: 400 });
  }
  const list = Array.isArray(body) ? (body as RpcMessage[]) : [body as RpcMessage];
  const out = (await Promise.all(list.map((m) => handleMcp(m, key, rpc, notify)))).filter((x): x is object => x !== null);
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? out : out[0]);
}
