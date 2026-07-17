import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DbResult } from "@/lib/db/client";

export interface AgentTestModel {
  id: string;
  hidden?: boolean;
}

export interface AgentTestResult {
  success: boolean;
  message?: string;
  models?: AgentTestModel[];
  current_model?: string;
}

export async function testAgentConnection(params: {
  endpoint: string;
  apiKey?: string;
  agentProgram?: string;
  agentType?: string;
}): Promise<DbResult<AgentTestResult>> {
  return invoke<DbResult<AgentTestResult>>("test_agent_connection", {
    endpoint: params.endpoint,
    apiKey: params.apiKey ?? null,
    agentProgram: params.agentProgram ?? null,
    agentType: params.agentType ?? null,
  });
}

export interface ChatChunkPayload {
  requestId: string;
  delta: string;
}

export interface ChatMessageInput {
  role: string;
  content: string;
}

export interface SendAgentChatParams {
  agentId: string;
  messages: ChatMessageInput[];
  originalUserMessage?: string;
  onDelta?: (delta: string) => void;
}

export interface AgentChatResult {
  content: string;
}

/**
 * Streams the reply via the `agent-chat-chunk` Tauri event (filtered by a
 * per-call requestId) while `onDelta` fires, and resolves once the Rust side
 * has persisted + pruned the final message — mirrors the original SSE relay's
 * two guarantees (live typing + a definite completion point).
 */
export async function sendAgentChat(params: SendAgentChatParams): Promise<DbResult<AgentChatResult>> {
  const requestId = crypto.randomUUID();
  let unlisten: UnlistenFn | undefined;

  if (params.onDelta) {
    unlisten = await listen<ChatChunkPayload>("agent-chat-chunk", (event) => {
      if (event.payload.requestId === requestId) {
        params.onDelta!(event.payload.delta);
      }
    });
  }

  try {
    return await invoke<DbResult<AgentChatResult>>("agent_chat", {
      requestId,
      agentId: params.agentId,
      messages: params.messages,
      originalUserMessage: params.originalUserMessage ?? null,
    });
  } finally {
    unlisten?.();
  }
}

export interface AgentChatLog {
  timestamp: string;
  duration_ms: number;
  input_token_size: number;
  output_token_size: number;
  user_message: string;
  assistant_message: string;
}

export async function getAgentChatLogs(agentId: string): Promise<DbResult<AgentChatLog[]>> {
  return invoke<DbResult<AgentChatLog[]>>("get_agent_chat_logs", { agentId });
}
