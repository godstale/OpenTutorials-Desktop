import { db, LOCAL_USER_ID } from "@/lib/db/client";
import type { UserExternalAgent } from "@/lib/types";

export async function getExternalAgents(): Promise<UserExternalAgent[]> {
  const { data, error } = await db.from("user_external_agents").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`${error.message} (${error.code || ""})`);
  return (data ?? []) as UserExternalAgent[];
}

export async function getExternalAgentById(id: string): Promise<UserExternalAgent> {
  const { data, error } = await db.from("user_external_agents").select("*").eq("id", id).single();
  if (error) throw new Error(`${error.message} (${error.code || ""})`);
  return data as UserExternalAgent;
}

export async function createExternalAgent(
  agent: Omit<UserExternalAgent, "id" | "user_id" | "status" | "created_at" | "updated_at">,
): Promise<UserExternalAgent> {
  if (agent.is_ai_tutor === true) {
    const { error: resetError } = await db
      .from("user_external_agents")
      .update({ is_ai_tutor: false, is_tutor_configured: false })
      .eq("user_id", LOCAL_USER_ID);
    if (resetError) throw new Error(`${resetError.message} (${resetError.code || ""})`);
  }

  const { data, error } = await db
    .from("user_external_agents")
    .insert({
      ...agent,
      user_id: LOCAL_USER_ID,
      status: "offline",
    })
    .select()
    .single();

  if (error) throw new Error(`${error.message} (${error.code || ""})`);
  return data as UserExternalAgent;
}

export async function updateExternalAgent(
  id: string,
  updates: Partial<Omit<UserExternalAgent, "id" | "user_id" | "created_at" | "updated_at">>,
): Promise<void> {
  if (updates.is_ai_tutor === true) {
    const { error: resetError } = await db
      .from("user_external_agents")
      .update({ is_ai_tutor: false, is_tutor_configured: false })
      .eq("user_id", LOCAL_USER_ID);
    if (resetError) throw new Error(`${resetError.message} (${resetError.code || ""})`);
  }

  const { error } = await db.from("user_external_agents").update(updates).eq("id", id);
  if (error) throw new Error(`${error.message} (${error.code || ""})`);
}

export async function deleteExternalAgent(id: string): Promise<void> {
  const { error } = await db.from("user_external_agents").delete().eq("id", id);
  if (error) throw new Error(`${error.message} (${error.code || ""})`);
}
