export interface UserExternalAgent {
  id: string;
  user_id: string;
  name: string;
  endpoint: string;
  api_key?: string;
  web_ui_url?: string;
  status: "online" | "offline" | "error";
  selected_model?: string;
  dashboard_api_url?: string;
  dashboard_session_token?: string;
  is_ai_tutor?: boolean;
  is_tutor_configured?: boolean;
  agent_type?: "harness" | "llm";
  env_type?: "local" | "cloud";
  agent_program?: "hermes" | "openclaw" | "ollama" | "lmstudio" | "other" | "openai" | "claude" | "gemini" | "deepseek" | "qwen" | "kimi";
  created_at: string;
  updated_at: string;
}

export interface UserExternalAgentMessage {
  id: string;
  agent_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
