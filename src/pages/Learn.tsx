import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactPlayer from "react-player";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Bot,
  User,
  Send,
  Loader2,
  Lock,
  Trash2,
  X,
} from "lucide-react";

import { db, LOCAL_USER_ID } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/context/LanguageContext";
import { useLearnLayout } from "@/lib/context/LearnLayoutContext";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getLeafNodes, LearnTocNodeView } from "@/components/learn/LearnTocNodeView";
import { MarkdownCard } from "@/components/learn/MarkdownCard";
import { getExternalAgents, updateExternalAgent } from "@/lib/api/external-agents";
import { sendAgentChat, testAgentConnection } from "@/lib/agent/client";
import type { CoursePackage, LearnCard, TocNode, UserProgress, VideoInfo } from "@/lib/types/course";
import type { UserExternalAgent } from "@/lib/types";

const TUTOR_WIDTH_KEY = "open-tutorials-tutor-width";
const BYPASS_CHECKPOINT_KEY = "open-tutorials-bypass-checkpoint";
const MAX_TOKENS_KEY = "open-tutorials-agent-max-tokens";
const COMPRESSION_THRESHOLD_KEY = "open-tutorials-agent-compression-threshold";

interface Checkpoint {
  afterCard: string;
  prompt: string;
}

interface ChatMessage {
  id: string;
  role: "agent" | "user" | "system";
  content: string;
  timestamp?: string;
}

function formatSubtitleTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function fetchCard(slug: string, node: TocNode): Promise<LearnCard> {
  const filename = node.filename!;
  const storagePath = `${slug}/cards/${filename}`;
  const { data: blob, error } = await db.storage.from("courses").download(storagePath);

  if (error || !blob) {
    return {
      filename,
      title: node.title,
      type: "markdown",
      content: `### 콘텐츠를 불러올 수 없습니다\n카드 파일 \`${filename}\`을(를) 찾을 수 없습니다.`,
      videoInfo: null,
    };
  }

  const text = await blob.text();

  if (filename.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text);
      const videoInfo: VideoInfo | null = parsed.video_info ?? null;
      return { filename, title: node.title, type: "video", content: text, videoInfo };
    } catch {
      return {
        filename,
        title: node.title,
        type: "markdown",
        content: `### 카드 파싱 오류\n카드 파일 \`${filename}\`을(를) 파싱하는 중 오류가 발생했습니다.`,
        videoInfo: null,
      };
    }
  }

  return { filename, title: node.title, type: "markdown", content: text, videoInfo: null };
}

// Extracts <!-- HIDDEN_MESSAGE: {...} --> sentinels the agent appends to signal
// checkpoint pass/fail or download status, and strips them from the visible text.
function parseHiddenMessages(text: string): {
  cleanText: string;
  downloaded: boolean | null;
  checkpointPassed: boolean | null;
} {
  const regex = /<!--\s*HIDDEN_MESSAGE:\s*(\{[\s\S]*?\})\s*-->/g;
  let downloaded: boolean | null = null;
  let checkpointPassed: boolean | null = null;

  const cleanText = text.replace(regex, (_fullMatch, jsonStr) => {
    try {
      const data = JSON.parse(jsonStr);
      if (data.action === "download_status") {
        downloaded = data.downloaded;
      } else if (data.action === "checkpoint_evaluation") {
        checkpointPassed = data.passed;
      }
    } catch (e) {
      console.error("Failed to parse hidden message JSON:", e);
    }
    return "";
  });

  return { cleanText, downloaded, checkpointPassed };
}

// Hides a partially-streamed-in hidden comment (e.g. mid "<!-- HIDDEN_MESS...")
// from the live typing effect until it's either completed or turns out not to be one.
function cleanStreamingText(text: string): string {
  const partialIndex = text.indexOf("<!--");
  if (partialIndex !== -1) {
    const closeIndex = text.indexOf("-->", partialIndex);
    if (closeIndex === -1) {
      return text.substring(0, partialIndex);
    }
  }
  return text;
}

function generateFallbackTocText(nodes: TocNode[], depth: number = 0): string {
  let text = "";
  const indent = "  ".repeat(depth);
  nodes.forEach((node) => {
    text += `${indent}- [${node.type.toUpperCase()}] ${node.title}\n`;
    if (node.description) {
      text += `${indent}  Description: ${node.description}\n`;
    }
    if (node.filename) {
      text += `${indent}  File: ${node.filename}\n`;
    }
    if (node.children && node.children.length > 0) {
      text += generateFallbackTocText(node.children, depth + 1);
    }
  });
  return text;
}

function buildCardContentForPrompt(card: LearnCard | undefined): string {
  let cardContent = card?.content || "";
  if (card?.type === "video" && card?.videoInfo?.subtitles) {
    const subtitleTexts = card.videoInfo.subtitles.map(
      (sub) => `[${Math.floor(sub.start / 60)}:${String(Math.floor(sub.start % 60)).padStart(2, "0")}] ${sub.text}`,
    );
    cardContent = `이 카드는 동영상 강의입니다. 아래는 동영상의 자막 스크립트 내용입니다:\n---\n${subtitleTexts.join("\n")}\n---`;
  }
  return cardContent;
}

function buildSystemPrompt({
  course,
  currentCard,
  currentNode,
  currentCardIndex,
  totalCards,
  wikiContent,
  agentType,
  isCheckpointMode,
  activeCheckpoint,
  isFallback,
  isFirstQuestion,
  finalResourceUrl,
}: {
  course: CoursePackage;
  currentCard: LearnCard | undefined;
  currentNode: TocNode | undefined;
  currentCardIndex: number;
  totalCards: number;
  wikiContent: string;
  agentType: "harness" | "llm";
  isCheckpointMode: boolean;
  activeCheckpoint: Checkpoint | null;
  isFallback: boolean;
  isFirstQuestion: boolean;
  finalResourceUrl: string;
}): string {
  const cardContent = buildCardContentForPrompt(currentCard);

  let currentUnitContext = "";
  if (currentNode) {
    currentUnitContext = `[Current Unit Details]\nUnit Title: ${currentNode.title}\nUnit Objective/Description: ${currentNode.description || "No description available."}`;
  }

  const rawTargetAge = course.target_age || "all";
  const targetAge =
    rawTargetAge === "all"
      ? "All Ages (전연령)"
      : rawTargetAge.endsWith("+")
        ? `${rawTargetAge.slice(0, -1)} years and older (${rawTargetAge.slice(0, -1)}세 이상)`
        : `${rawTargetAge} years old (${rawTargetAge}세)`;
  const category = course.category || "General";
  const tags = course.tags?.join(", ") || "None";

  let systemPrompt = "";
  if (agentType === "llm") {
    const tocItems = course.toc || [];
    const tocTreeText = generateFallbackTocText(tocItems, 0);

    systemPrompt = `You are a helpful AI tutor for the course "${course.title}".
Use the following information to answer the student's question and guide them through their learning.

[Course Info]
Title: ${course.title}
Description: ${course.description || "No description available."}
Category: ${category}
Target Audience: ${targetAge}
Tags: ${tags}

[Course Table of Contents]
${tocTreeText}

[Learning Progress & Context]
Progress: Card ${currentCardIndex + 1} of ${totalCards} (${Math.round(((currentCardIndex + 1) / totalCards) * 100)}% completed)
${currentUnitContext}

[Current Card Content]
Title: ${currentNode?.title || "Untitled"}
Content:
${cardContent}

${wikiContent ? `[Relevant Course Wiki & Resources]\n${wikiContent}\n` : ""}

[Instruction for AI Tutor]
- Adapt your explanation depth, vocabulary complexity, and tone to suit the target audience: "${targetAge}". (e.g., use friendly, simple, and visual analogies for children/teens, and structured, professional context for adults.)
- Guide the student step-by-step using the context above.
- Keep your answer clear, informative, and formatted in markdown.`;

    if (isCheckpointMode && activeCheckpoint) {
      systemPrompt += `

[Active Checkpoint QnA Evaluation]
The student is currently undergoing a checkpoint QnA for the card "${currentNode?.title || "Untitled"}".
The evaluation instruction is:
"${activeCheckpoint.prompt}"

You must evaluate the student's response.
If the student's response satisfies the criteria, respond with praise and details, and you MUST append the following exact HTML comment at the very end of your response:
<!-- HIDDEN_MESSAGE: {"action": "checkpoint_evaluation", "passed": true} -->

If the student's response does NOT satisfy the criteria, explain why and encourage them to try again, and you MUST append the following exact HTML comment at the very end of your response:
<!-- HIDDEN_MESSAGE: {"action": "checkpoint_evaluation", "passed": false} -->`;
    }
  } else {
    // Harness agent branch. This desktop app has no Supabase and no public HTTP hosting
    // of course files, so `finalResourceUrl` is always empty and `isFallback` is always
    // true — this always takes the same graceful-degradation path the original already
    // had for whenever cloud storage was unavailable, appending the course TOC directly
    // into the prompt instead of a download URL.
    let fallbackTocText = "";
    if (isFallback && isFirstQuestion) {
      const tocItems = course.toc || [];
      const tocTreeText = generateFallbackTocText(tocItems, 0);
      fallbackTocText = `\n\n[Fallback Course Table of Contents]\n${tocTreeText}\n\nNote: The resource URL could not be loaded via external storage. Please refer to this Table of Contents to understand the overall course structure.`;
    }

    systemPrompt = `You are a helpful AI tutor for the course "${course.title}".
To minimize context payload, detailed course contents (summaries, chapters, and all card contents) are not sent directly in the chat messages.
Instead, you must download the complete course materials from the following URL into a course-specific directory in your workspace (e.g. "courses/${course.slug || "slug"}") if you don't already have them:
${finalResourceUrl}

If you have already downloaded/cached the course materials from this URL previously, DO NOT download them again.

Additionally, you MUST communicate the status of the course materials download back to the system using a special format called a "Hidden Message".
Whenever you respond (especially on the first system check or after download completes), append the following HTML comment at the end of your response:
<!-- HIDDEN_MESSAGE: {"action": "download_status", "downloaded": true} -->
Use "downloaded": true if the materials are successfully downloaded/extracted and analyzed in your workspace, otherwise use "downloaded": false.

[Target Student Profile]
Category: ${category}
Target Audience: ${targetAge}
Tags: ${tags}

[Instruction]
- Adapt your explanation depth, vocabulary complexity, and tone to suit the target audience: "${targetAge}". (e.g., use friendly, simple, and visual analogies for children/teens, and structured, professional context for adults.)
- Please guide the student using the current card context provided in the user's message.${fallbackTocText}`;

    if (isCheckpointMode && activeCheckpoint) {
      systemPrompt += `

[Active Checkpoint QnA Evaluation]
The student is currently undergoing a checkpoint QnA for the card "${currentNode?.title || "Untitled"}".
The evaluation instruction is:
"${activeCheckpoint.prompt}"

You must evaluate the student's response.
If the student's response satisfies the criteria, respond with praise and details, and you MUST append the following exact HTML comment at the very end of your response:
<!-- HIDDEN_MESSAGE: {"action": "checkpoint_evaluation", "passed": true} -->

If the student's response does NOT satisfy the criteria, explain why and encourage them to try again, and you MUST append the following exact HTML comment at the very end of your response:
<!-- HIDDEN_MESSAGE: {"action": "checkpoint_evaluation", "passed": false} -->`;
    }
  }

  return systemPrompt;
}

function buildCurrentCardContext({
  currentCard,
  currentNode,
  currentCardIndex,
  totalCards,
}: {
  currentCard: LearnCard | undefined;
  currentNode: TocNode | undefined;
  currentCardIndex: number;
  totalCards: number;
}): string {
  const cardContent = buildCardContentForPrompt(currentCard);

  let currentUnitContext = "";
  if (currentNode) {
    currentUnitContext = `[Current Unit Details]\nUnit Title: ${currentNode.title}\nUnit Objective/Description: ${currentNode.description || "No description available."}`;
  }

  return `[Current Card Context]
Card Title: ${currentNode?.title || "Untitled"}
Progress: Card ${currentCardIndex + 1} of ${totalCards} (${Math.round(((currentCardIndex + 1) / totalCards) * 100)}% completed)
${currentUnitContext}

Card Content:
${cardContent}
--------------------------------------------------
Student Question: `;
}

function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getFormattedTime(): string {
  return new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function estimateTokenCount(text: string): number {
  if (!text) return 0;
  const koreanCharCount = (text.match(/[가-힣]/g) || []).length;
  const otherCharCount = text.length - koreanCharCount;
  return Math.ceil(koreanCharCount * 1.5 + otherCharCount * 0.5);
}

function getMaxTokenLimit(maxTokensStr: string): number {
  const clean = maxTokensStr.toLowerCase().trim();
  const match = clean.match(/^(\d+)k$/);
  if (match) {
    return parseInt(match[1], 10) * 1024;
  }
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 16384 : parsed;
}

function calculateTotalTokens(apiMessages: { role: string; content: string }[]): number {
  return apiMessages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0);
}

function ChatMessageContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_pre]:my-2 [&_pre]:whitespace-pre-wrap">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export default function Learn() {
  const { slug: rawSlug } = useParams<{ slug: string }>();
  const slug = rawSlug ? decodeURIComponent(rawSlug) : "";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { layout } = useLearnLayout();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();

  const cardParam = searchParams.get("card");
  const initialCardIndex = cardParam ? Math.max(0, parseInt(cardParam, 10) - 1) : 0;
  const isPreview = searchParams.get("preview") === "true";
  const isReview = searchParams.get("review") === "true";

  const [course, setCourse] = useState<CoursePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [currentCardIndex, setCurrentCardIndex] = useState(initialCardIndex);
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(initialCardIndex);
  const [isCourseCompleted, setIsCourseCompleted] = useState(false);

  const [tocWidth, setTocWidth] = useState<number>(256);
  const [tutorWidth, setTutorWidth] = useState<number>(400);
  const [bypassCheckpointSetting, setBypassCheckpointSetting] = useState<boolean>(false);
  const [maxTokens, setMaxTokens] = useState<string>("32k");
  const [compressionThreshold, setCompressionThreshold] = useState<number>(70);

  const [cardCache, setCardCache] = useState<Map<string, LearnCard>>(new Map());
  const [cardLoading, setCardLoading] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoVolume, setVideoVolume] = useState(1);
  const [isSubtitlePopupOpen, setIsSubtitlePopupOpen] = useState(false);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const lastPlayedCardIndex = useRef<number | null>(null);
  const lastSentCardIndex = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Checkpoint QnA state
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [isCheckpointMode, setIsCheckpointMode] = useState(false);
  const [activeCheckpoint, setActiveCheckpoint] = useState<Checkpoint | null>(null);
  const [passedCheckpoints, setPassedCheckpoints] = useState<Set<string>>(new Set());
  const [showCheckpointDialog, setShowCheckpointDialog] = useState(false);
  const [dismissedCheckpointPopups, setDismissedCheckpointPopups] = useState<Set<string>>(new Set());

  // AI tutor chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [promptUsage, setPromptUsage] = useState<number | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<"loading" | "online" | "offline" | "none">("loading");
  const [agentType, setAgentType] = useState<"harness" | "llm">("harness");
  const [wikiContent, setWikiContent] = useState<string>("");

  // Minimize the global app sidebar while on the learn screen — this page has its own TOC panel.
  // Remember whatever state it was in beforehand so leaving this screen restores it.
  const sidebarOpenBeforeLearn = useRef(sidebarOpen);
  useEffect(() => {
    setSidebarOpen(false);
    return () => setSidebarOpen(sidebarOpenBeforeLearn.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("open-tutorials-toc-width");
    if (saved) setTocWidth(parseInt(saved, 10));
    const savedTutor = localStorage.getItem(TUTOR_WIDTH_KEY);
    if (savedTutor) setTutorWidth(parseInt(savedTutor, 10));
    setBypassCheckpointSetting(localStorage.getItem(BYPASS_CHECKPOINT_KEY) === "true");
    const savedMaxTokens = localStorage.getItem(MAX_TOKENS_KEY);
    if (savedMaxTokens) setMaxTokens(savedMaxTokens);
    const savedThreshold = localStorage.getItem(COMPRESSION_THRESHOLD_KEY);
    if (savedThreshold) setCompressionThreshold(parseInt(savedThreshold, 10));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);

    (async () => {
      const { data: courseData, error: courseErr } = await db
        .from<CoursePackage>("course_packages")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (!active) return;
      if (courseErr || !courseData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCourse(courseData);

      const { data: progressData } = await db
        .from<UserProgress>("user_progress")
        .select("*")
        .eq("user_id", LOCAL_USER_ID)
        .eq("course_id", courseData.id)
        .maybeSingle();

      if (!active) return;

      if (progressData) {
        setIsCourseCompleted(!!progressData.completed);
        const savedMaxCard = progressData.max_card ?? progressData.last_card ?? 1;
        setMaxUnlockedIndex(Math.max(initialCardIndex, savedMaxCard - 1));
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Load per-course checkpoints from config.json (written into storage by the bundle
  // importer, same as card files). Missing/unparseable config.json just means "no
  // checkpoints for this course" — not an error state.
  useEffect(() => {
    if (!course) return;
    let active = true;
    (async () => {
      try {
        const { data: blob } = await db.storage.from("courses").download(`${slug}/config.json`);
        if (!blob) {
          if (active) setCheckpoints([]);
          return;
        }
        const text = await blob.text();
        const parsed = JSON.parse(text);
        if (active) setCheckpoints(Array.isArray(parsed?.checkpoints) ? parsed.checkpoints : []);
      } catch {
        if (active) setCheckpoints([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [course, slug]);

  // Resolve the AI tutor agent for this course: an explicitly assigned agent_id, else
  // whichever agent is flagged as the default tutor. Then ping it to reflect real status.
  useEffect(() => {
    if (!course) return;
    let active = true;
    (async () => {
      setAgentStatus("loading");
      try {
        const agents = await getExternalAgents();
        let currentAgent: UserExternalAgent | undefined;
        if (course.agent_id) {
          currentAgent = agents.find((a) => a.id === course.agent_id);
        }
        if (!currentAgent) {
          currentAgent = agents.find((a) => a.is_ai_tutor === true);
        }

        if (!active) return;
        if (!currentAgent) {
          setAgentStatus("none");
          setAgentId(null);
          return;
        }

        setAgentId(currentAgent.id);
        setAgentType(currentAgent.agent_type === "llm" ? "llm" : "harness");
        setAgentStatus(currentAgent.status === "online" ? "online" : "offline");

        try {
          const { data } = await testAgentConnection({
            endpoint: currentAgent.endpoint,
            apiKey: currentAgent.api_key,
            agentProgram: currentAgent.agent_program,
            agentType: currentAgent.agent_type,
          });
          if (!active) return;
          const actualStatus = data?.success ? "online" : "offline";
          setAgentStatus(actualStatus);
          if (currentAgent.status !== actualStatus) {
            await updateExternalAgent(currentAgent.id, { status: actualStatus });
          }
        } catch (pingErr) {
          console.error("Error checking actual status of tutor agent:", pingErr);
          if (active) setAgentStatus("offline");
        }
      } catch (err) {
        console.error("Failed to resolve tutor agent:", err);
        if (active) setAgentStatus("none");
      }
    })();
    return () => {
      active = false;
    };
  }, [course]);

  // Best-effort course wiki fetch (feature has no authoring UI yet in desktop, so this
  // will typically resolve to an empty string — kept for prompt-building parity).
  useEffect(() => {
    if (!course?.id) {
      setWikiContent("");
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data } = await db
          .from<{ content?: string }>("course_wiki")
          .select("*")
          .eq("course_id", course.id)
          .maybeSingle();
        if (active) setWikiContent(data?.content ?? "");
      } catch {
        if (active) setWikiContent("");
      }
    })();
    return () => {
      active = false;
    };
  }, [course?.id]);

  // Reset the visible chat + outgoing context whenever the learner moves to a new card
  // (or the resolved tutor agent changes), mirroring the original's per-card fresh context.
  useEffect(() => {
    if (!course) return;
    lastSentCardIndex.current = null;
    setMessages([
      {
        id: "1",
        role: "agent",
        content: t("lblTutorGreeting").replace("{course}", course.title),
        timestamp: getFormattedTime(),
      },
    ]);
    setPromptUsage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCardIndex, agentId, course?.title]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const tocItems = useMemo(() => course?.toc ?? [], [course]);
  const leafNodes = useMemo(() => getLeafNodes(tocItems), [tocItems]);
  const nodeToIndexMap = useMemo(() => {
    const map = new Map<TocNode, number>();
    leafNodes.forEach((node, idx) => map.set(node, idx));
    return map;
  }, [leafNodes]);
  const totalCards = leafNodes.length;
  const currentNode = leafNodes[currentCardIndex];
  const activeCard = currentNode ? cardCache.get(currentNode.filename!) : undefined;
  const activeCardSubtitles = activeCard?.videoInfo?.subtitles ?? [];

  const currentCardFilename = currentNode?.filename;
  const checkpoint = checkpoints.find((cp) => cp.afterCard === currentCardFilename);
  const alreadyPassed =
    (currentCardFilename ? passedCheckpoints.has(currentCardFilename) : false) || currentCardIndex < maxUnlockedIndex;
  const hasCheckpoint = !!(checkpoint && !alreadyPassed && !bypassCheckpointSetting);
  const canSkipCheckpoint =
    bypassCheckpointSetting || isReview || isPreview || !!isCourseCompleted || !course || !course.force_checkpoint;

  // Fetch (and cache) the active card's content on demand instead of prefetching the
  // whole course upfront — courses can have 50+ cards and this keeps navigation snappy.
  useEffect(() => {
    if (!course || !currentNode) return;
    if (cardCache.has(currentNode.filename!)) return;

    let active = true;
    setCardLoading(true);
    fetchCard(slug, currentNode).then((card) => {
      if (!active) return;
      setCardCache((prev) => new Map(prev).set(card.filename, card));
      setCardLoading(false);
    });
    return () => {
      active = false;
    };
  }, [course, currentNode, slug, cardCache]);

  useEffect(() => {
    setCurrentTime(0);
    setIsSubtitlePopupOpen(false);
    if (lastPlayedCardIndex.current === null) {
      lastPlayedCardIndex.current = currentCardIndex;
      setIsPlaying(false);
    } else if (lastPlayedCardIndex.current !== currentCardIndex) {
      lastPlayedCardIndex.current = currentCardIndex;
      setIsPlaying(activeCard?.type === "video");
    }
  }, [currentCardIndex, activeCard?.type]);

  const startResizingToc = (mouseDownEvent: ReactPointerEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = tocWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(180, Math.min(480, startWidth + deltaX));
      setTocWidth(newWidth);
      localStorage.setItem("open-tutorials-toc-width", newWidth.toString());
    };

    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");
  };

  const startResizingTutor = (mouseDownEvent: ReactPointerEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = tutorWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));
      setTutorWidth(newWidth);
      localStorage.setItem(TUTOR_WIDTH_KEY, newWidth.toString());
    };

    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");
  };

  const saveProgress = async (unlockedIndex: number, completed: boolean) => {
    if (!course?.id) return;
    try {
      const { data: existing } = await db
        .from<UserProgress>("user_progress")
        .select("*")
        .eq("user_id", LOCAL_USER_ID)
        .eq("course_id", course.id)
        .maybeSingle();

      const oldMax = existing?.max_card ?? existing?.last_card ?? 0;
      const newMax = Math.max(oldMax, unlockedIndex + 1);
      const finalCompleted = completed || existing?.completed || false;

      await db.from("user_progress").upsert({
        user_id: LOCAL_USER_ID,
        course_id: course.id,
        last_card: unlockedIndex + 1,
        max_card: newMax,
        completed: finalCompleted,
      });
    } catch (err) {
      console.error("Failed to save progress:", err);
    }
  };

  // Core "send a turn" function: builds the system prompt + running context, then relays
  // through sendAgentChat (which streams the live-typing delta and resolves once Rust has
  // already persisted/pruned/logged the exchange server-side — no manual saving here).
  async function sendMessage(text: string, baseMessages: ChatMessage[], isCheckpointTrigger: boolean = false) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = { id: generateUniqueId(), role: "user", content: trimmed, timestamp: getFormattedTime() };
    const newMessages = isCheckpointTrigger ? baseMessages : [...baseMessages, userMsg];
    if (!isCheckpointTrigger) {
      setMessages(newMessages);
    }

    if (!agentId || agentStatus === "none") {
      if (!isCheckpointTrigger) {
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { id: generateUniqueId(), role: "agent", content: t("lblNoOnlineAgent"), timestamp: getFormattedTime() },
          ]);
        }, 500);
      }
      return;
    }

    const assistantMsgId = generateUniqueId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "agent",
        content: isCheckpointTrigger ? t("lblGeneratingCheckpoint") : t("lblGeneratingResponse"),
        timestamp: getFormattedTime(),
      },
    ]);

    try {
      // No cloud storage exists in this app, so the harness prompt always takes its
      // fallback (TOC-in-prompt) path instead of pointing at a download URL.
      const isFallback = true;
      const finalResourceUrl = "";
      const isFirstQuestion = newMessages.filter((m) => m.role === "user").length === 1;
      const isCardChanged = lastSentCardIndex.current !== currentCardIndex;
      const shouldIncludeCardContext = isFirstQuestion || isCardChanged;

      const systemPrompt = buildSystemPrompt({
        course: course!,
        currentCard: activeCard,
        currentNode,
        currentCardIndex,
        totalCards,
        wikiContent,
        agentType,
        isCheckpointMode,
        activeCheckpoint,
        isFallback,
        isFirstQuestion,
        finalResourceUrl,
      });

      const currentCardContext = buildCurrentCardContext({ currentCard: activeCard, currentNode, currentCardIndex, totalCards });

      const apiMessages = newMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "agent" ? "assistant" : "user",
          content: m.content,
        }));

      if (agentType === "harness" && apiMessages.length > 0 && apiMessages[apiMessages.length - 1].role === "user" && !isCheckpointTrigger) {
        if (shouldIncludeCardContext) {
          apiMessages[apiMessages.length - 1] = {
            ...apiMessages[apiMessages.length - 1],
            content: `${currentCardContext}${trimmed}`,
          };
        }
        lastSentCardIndex.current = currentCardIndex;
      }

      if (isCheckpointTrigger) {
        apiMessages.push({ role: "user", content: trimmed });
      }

      apiMessages.unshift({ role: "system", content: systemPrompt });

      let liveText = "";
      const { data, error } = await sendAgentChat({
        agentId,
        messages: apiMessages,
        originalUserMessage: trimmed,
        onDelta: (delta) => {
          liveText += delta;
          const { cleanText } = parseHiddenMessages(liveText);
          const visibleText = cleanStreamingText(cleanText);
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: visibleText } : m)));
        },
      });

      if (error || !data) {
        throw new Error(error?.message || "Unknown error");
      }

      const { cleanText: finalCleanText, checkpointPassed: finalCheckpointPassed } = parseHiddenMessages(data.content);

      setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: finalCleanText } : m)));

      if (finalCheckpointPassed) {
        if (currentCardFilename) {
          setPassedCheckpoints((prev) => new Set(prev).add(currentCardFilename));
        }
        setIsCheckpointMode(false);
        setActiveCheckpoint(null);

        const nextIdx = currentCardIndex + 1;
        if (nextIdx < totalCards) {
          if (nextIdx > maxUnlockedIndex) {
            setMaxUnlockedIndex(nextIdx);
            saveProgress(nextIdx, false);
          }
        } else {
          setIsCourseCompleted(true);
          saveProgress(currentCardIndex, true);
        }
      }

      const completedApiMessages = [...apiMessages, { role: "assistant", content: finalCleanText }];
      const finalEstTokens = calculateTotalTokens(completedApiMessages);
      const limit = getMaxTokenLimit(maxTokens);
      const usagePercent = Math.min(100, Math.round((finalEstTokens / limit) * 100));
      setPromptUsage(usagePercent);
    } catch (err: unknown) {
      console.error("Failed to chat with agent:", err);
      const errorMessage = err instanceof Error ? err.message : t("errUnknownError");
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, content: t("lblResponseError").replace("{error}", errorMessage) } : m)),
      );
    }
  }

  const handleClearChat = () => {
    if (isCompressing || !course) return;
    setMessages([
      {
        id: "1",
        role: "agent",
        content: t("lblTutorGreeting").replace("{course}", course.title),
        timestamp: getFormattedTime(),
      },
    ]);
    setPromptUsage(null);
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isCompressing || !course) return;
    const userPrompt = input.trim();
    setInput("");

    if (!agentId || agentStatus === "none") {
      sendMessage(userPrompt, messages);
      return;
    }

    const userMsg: ChatMessage = { id: generateUniqueId(), role: "user", content: userPrompt };
    const newMessages = [...messages, userMsg];

    const isFallback = true;
    const finalResourceUrl = "";
    const isFirstQuestion = messages.filter((m) => m.role === "user").length === 0;
    const isCardChanged = lastSentCardIndex.current !== currentCardIndex;
    const shouldIncludeCardContext = isFirstQuestion || isCardChanged;

    const systemPrompt = buildSystemPrompt({
      course,
      currentCard: activeCard,
      currentNode,
      currentCardIndex,
      totalCards,
      wikiContent,
      agentType,
      isCheckpointMode,
      activeCheckpoint,
      isFallback,
      isFirstQuestion,
      finalResourceUrl,
    });

    const currentCardContext = buildCurrentCardContext({ currentCard: activeCard, currentNode, currentCardIndex, totalCards });

    const apiMessagesForEst = newMessages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }));

    if (agentType === "harness" && apiMessagesForEst.length > 0 && apiMessagesForEst[apiMessagesForEst.length - 1].role === "user") {
      if (shouldIncludeCardContext) {
        apiMessagesForEst[apiMessagesForEst.length - 1] = {
          ...apiMessagesForEst[apiMessagesForEst.length - 1],
          content: `${currentCardContext}${userPrompt}`,
        };
      }
    }

    apiMessagesForEst.unshift({ role: "system", content: systemPrompt });

    const estTokens = calculateTotalTokens(apiMessagesForEst);
    const limit = getMaxTokenLimit(maxTokens);
    const triggerRatio = compressionThreshold / 100;
    const triggerLimit = limit * triggerRatio;

    if (estTokens >= triggerLimit && messages.length > 2) {
      setIsCompressing(true);
      const compressingMsgId = "compressing-" + Date.now();
      setMessages((prev) => [...prev, { id: compressingMsgId, role: "system", content: t("lblCompressingChat") }]);

      try {
        const historyText = messages
          .filter((m) => m.id !== "1" && m.role !== "system")
          .map((m) => `${m.role === "user" ? "학생" : "튜터"}: ${m.content}`)
          .join("\n\n");

        const compressionPrompt = `[System History Compression Instruction]\n${t("lblCompressionInstruction")}\n\n[대화 기록]\n${historyText}`;
        const compSystemPrompt =
          "You are an AI assistant designed to compress chat history. Summarize the given history concisely in Korean. Keep all essential code snippets and definitions. Do not include any greeting or explanation.";

        const { data: compData, error: compError } = await sendAgentChat({
          agentId,
          messages: [
            { role: "system", content: compSystemPrompt },
            { role: "user", content: compressionPrompt },
          ],
          originalUserMessage: compressionPrompt,
        });

        if (compError || !compData) {
          throw new Error(compError?.message || "Unknown error");
        }

        const cleanSummary = compData.content.replace(/<!--[\s\S]*?-->/g, "").trim();
        const summaryContent = `[이전 대화 요약]\n\n${cleanSummary}`;
        const summaryMsg: ChatMessage = { id: generateUniqueId(), role: "agent", content: summaryContent, timestamp: getFormattedTime() };

        const newApiMessagesForEst = [messages[0], summaryMsg, { id: "dummy", role: "user" as const, content: userPrompt }].map((m) => ({
          role: m.role === "agent" ? "assistant" : "user",
          content: m.content,
        }));
        if (agentType === "harness" && newApiMessagesForEst.length > 0) {
          const lastIdx = newApiMessagesForEst.length - 1;
          newApiMessagesForEst[lastIdx] = { ...newApiMessagesForEst[lastIdx], content: `${currentCardContext}${userPrompt}` };
        }
        newApiMessagesForEst.unshift({ role: "system", content: systemPrompt });

        const newEstTokens = calculateTotalTokens(newApiMessagesForEst);
        const compressionRate = Math.round((1 - newEstTokens / estTokens) * 100);

        const systemNoticeMsg: ChatMessage = {
          id: "system-notice-" + generateUniqueId(),
          role: "system",
          content: t("lblChatCompressed").replace("{rate}", String(compressionRate)).replace("{tokens}", newEstTokens.toLocaleString()),
        };

        setMessages([messages[0], summaryMsg, systemNoticeMsg]);
        setIsCompressing(false);

        sendMessage(userPrompt, [messages[0], summaryMsg]);
      } catch (compErr) {
        console.error("Error during auto-compression:", compErr);
        setIsCompressing(false);
        setMessages((prev) => prev.filter((m) => m.id !== compressingMsgId));
        sendMessage(userPrompt, messages);
      }
    } else {
      sendMessage(userPrompt, messages);
    }
  };

  const handleSelectCard = (idx: number) => {
    if (isCheckpointMode) {
      const confirmSkip = window.confirm(t("lblCheckpointSkipConfirm"));
      if (!confirmSkip) return;
      setIsCheckpointMode(false);
      setActiveCheckpoint(null);
    }
    setCurrentCardIndex(idx);
  };

  const handleSkipCheckpoint = () => {
    if (currentCardFilename) {
      setPassedCheckpoints((prev) => new Set(prev).add(currentCardFilename));
    }
    setIsCheckpointMode(false);
    setActiveCheckpoint(null);
    setMessages((prev) => [
      ...prev,
      { id: generateUniqueId(), role: "agent", content: t("lblCheckpointDesc2"), timestamp: getFormattedTime() },
    ]);

    const nextIdx = currentCardIndex + 1;
    if (nextIdx < totalCards) {
      if (nextIdx > maxUnlockedIndex) {
        setMaxUnlockedIndex(nextIdx);
        saveProgress(nextIdx, false);
      }
    } else {
      setIsCourseCompleted(true);
      saveProgress(currentCardIndex, true);
    }
  };

  const startCheckpointQnA = (cp: Checkpoint) => {
    setIsCheckpointMode(true);
    setActiveCheckpoint(cp);

    const triggerPrompt = `[System Checkpoint QnA Instruction]
The student has just completed the card "${currentNode?.title ?? ""}".
You must now test the student's understanding by asking a question based on this instruction:
"${cp.prompt}"

Please ask the student the question now. Only ask the question itself, do not reveal the answer or evaluation criteria yet. Make your tone friendly and encouraging.`;

    sendMessage(triggerPrompt, messages, true);
  };

  const handleNext = () => {
    if (hasCheckpoint && checkpoint) {
      if (isCheckpointMode) {
        if (canSkipCheckpoint) {
          handleSkipCheckpoint();
          return;
        }
        alert(t("lblCheckpointNoticeRight"));
        return;
      }

      if (currentCardFilename && !dismissedCheckpointPopups.has(currentCardFilename)) {
        setShowCheckpointDialog(true);
        return;
      }

      startCheckpointQnA(checkpoint);
      return;
    }

    const nextIdx = currentCardIndex + 1;
    if (nextIdx < totalCards) {
      if (nextIdx > maxUnlockedIndex) {
        setMaxUnlockedIndex(nextIdx);
        saveProgress(nextIdx, false);
      }
      setCurrentCardIndex(nextIdx);
    } else {
      if (currentCardIndex > maxUnlockedIndex) {
        setMaxUnlockedIndex(currentCardIndex);
      }
      setIsCourseCompleted(true);
      saveProgress(currentCardIndex, true);
      navigate("/my-courses");
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        {t("lblLoadingCourse")}
      </div>
    );
  }

  if (notFound || !course) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("errCourseNotFound")}
      </div>
    );
  }

  const showToc = layout === "toc-content" || layout === "3-layout";
  const showTutor = layout === "3-layout" || layout === "content-tutor";
  const unlockedCount = isPreview ? totalCards : maxUnlockedIndex + 1;

  return (
    <div className="no-layout-padding flex h-full w-full overflow-hidden">
      {showToc && (
        <div style={{ width: `${tocWidth}px` }} className="bg-background flex flex-col h-full shrink-0 min-h-0 relative">
          <div className="p-4 border-b shrink-0 flex items-center justify-between">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" /> {t("courseCurriculum")}
            </h3>
          </div>

          <div className="px-4 py-3 border-b bg-muted/20 shrink-0">
            <div className="flex justify-between items-center text-xs text-muted-foreground mb-1.5 font-medium">
              <span>{t("lblLearningProgress")}</span>
              <span>
                {t("lblUnlockedProgress")
                  .replace("{unlocked}", String(unlockedCount))
                  .replace("{total}", String(totalCards))
                  .replace("{percent}", String(Math.round((unlockedCount / totalCards) * 100)))}
              </span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.round((unlockedCount / totalCards) * 100)}%` }}
              />
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-1">
              {tocItems.map((item, idx) => (
                <LearnTocNodeView
                  key={`${item.title}-${idx}`}
                  node={item}
                  depth={0}
                  nodeToIndexMap={nodeToIndexMap}
                  maxUnlockedIndex={isPreview ? totalCards - 1 : maxUnlockedIndex}
                  currentCardIndex={currentCardIndex}
                  isCourseCompleted={isCourseCompleted}
                  onSelectCard={handleSelectCard}
                />
              ))}
            </div>
          </ScrollArea>

          {isSubtitlePopupOpen && activeCard?.type === "video" && (
            <div className="absolute inset-0 z-20 bg-background flex flex-col">
              <div className="p-4 border-b shrink-0 flex items-center justify-between">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Captions className="w-4 h-4 text-primary" /> {t("lblSubtitleNav")}
                </h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsSubtitlePopupOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="divide-y">
                  {activeCardSubtitles.map((sub, idx) => {
                    const isActiveSubtitle = currentTime >= sub.start && currentTime <= sub.end;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (playerRef.current) playerRef.current.currentTime = sub.start;
                          setCurrentTime(sub.start);
                          setIsPlaying(true);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2.5 text-xs transition-colors",
                          isActiveSubtitle ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground",
                        )}
                      >
                        <span className={cn("font-mono mr-2", !isActiveSubtitle && "text-muted-foreground")}>
                          [{formatSubtitleTime(sub.start)}]
                        </span>
                        {sub.text}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      )}

      {showToc && (
        <div
          onPointerDown={startResizingToc}
          className="w-1 hover:w-1.5 active:w-1.5 bg-border hover:bg-primary/50 active:bg-primary transition-all cursor-col-resize h-full select-none flex-shrink-0 z-40 relative group"
        >
          <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
        </div>
      )}

      <main className="flex-1 flex flex-col h-full bg-background relative overflow-hidden border-none min-w-0">
        <header className="h-16 px-6 flex items-center justify-between border-b shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded">Card {currentCardIndex + 1}</span>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {currentNode?.title || t("lblLearningContentCard").replace("{cardIndex}", String(currentCardIndex + 1))}
              {isPreview && (
                <Badge variant="destructive" className="bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs py-0.5 px-2 animate-pulse">
                  {t("lblPreviewMode")}
                </Badge>
              )}
              {isReview && (
                <Badge variant="secondary" className="text-xs py-0.5 px-2">
                  {t("lblReview")}
                </Badge>
              )}
              {isCheckpointMode && (
                <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px] py-0.5 px-2 animate-pulse">
                  {t("lblCheckpointActive")}
                </Badge>
              )}
            </h1>
          </div>
          <div className="flex gap-2">
            {activeCard?.type === "video" && activeCardSubtitles.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setIsSubtitlePopupOpen(true)}>
                <Captions className="w-4 h-4 mr-2" /> {t("lblSubtitleNav")}
              </Button>
            )}
          </div>
        </header>

        <ScrollArea className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-full mx-auto pb-6">
            <Card className="p-8 relative overflow-hidden bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 shadow-md">
              <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
              <div className="prose dark:prose-invert max-w-none text-foreground dark:text-zinc-300 space-y-4">
                {cardLoading || !activeCard ? (
                  <div className="text-muted-foreground text-sm animate-pulse">
                    {t("lblLoadingCard")}
                  </div>
                ) : activeCard.type === "video" ? (
                  activeCard.videoInfo?.video_id ? (
                    <div className="not-prose space-y-4">
                      <div className="w-full aspect-video relative rounded-lg overflow-hidden bg-zinc-950">
                        <ReactPlayer
                          ref={playerRef}
                          src={`https://www.youtube.com/watch?v=${activeCard.videoInfo.video_id}`}
                          controls
                          playing={isPlaying}
                          volume={videoVolume}
                          className="absolute top-0 left-0"
                          width="100%"
                          height="100%"
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onTimeUpdate={(e: React.SyntheticEvent<HTMLVideoElement>) => setCurrentTime(e.currentTarget.currentTime)}
                          onVolumeChange={(e: React.SyntheticEvent<HTMLVideoElement>) => setVideoVolume(e.currentTarget.volume)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-destructive">
                      {t("errVideoLoadFailed")}
                    </div>
                  )
                ) : (
                  <MarkdownCard slug={slug} content={activeCard.content ?? ""} />
                )}
              </div>
            </Card>
          </div>
        </ScrollArea>

        <div className="h-16 shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-6">
          <Button variant="outline" onClick={() => handleSelectCard(Math.max(0, currentCardIndex - 1))} disabled={currentCardIndex === 0}>
            <ChevronLeft className="w-4 h-4 mr-2" /> {t("btnPrev")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentCardIndex + 1} / {totalCards}
          </span>
          <Button onClick={handleNext}>
            {currentCardIndex < totalCards - 1 ? t("btnNext") : t("completed")}{" "}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>

      {showTutor && (
        <div
          onPointerDown={startResizingTutor}
          className="w-1 hover:w-1.5 active:w-1.5 bg-border hover:bg-primary/50 active:bg-primary transition-all cursor-col-resize h-full select-none flex-shrink-0 z-40 relative group"
        >
          <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
        </div>
      )}

      {showTutor && (
        <aside
          style={{ width: `${tutorWidth}px` }}
          className="shrink-0 bg-muted/10 flex flex-col h-full shadow-lg z-10 overflow-hidden min-h-0 border-l border-border/50"
        >
          {isCheckpointMode && activeCheckpoint && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-400 flex items-center justify-between shrink-0">
              <span className="font-medium flex items-center gap-1">{t("lblCheckpointActive")}</span>
              {canSkipCheckpoint && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200 p-1 hover:bg-amber-500/20"
                  onClick={handleSkipCheckpoint}
                >
                  {t("btnSkipQna")}
                </Button>
              )}
            </div>
          )}

          <div className="p-4 border-b flex items-center gap-3 bg-background shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold flex items-center gap-1.5">
                {t("lblTutorPanel")}
                {isCheckpointMode && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium animate-pulse">
                    {t("lblCheckpointQna")}
                  </span>
                )}
              </h3>
              <div className="flex flex-col gap-1">
                {agentStatus === "loading" ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">{t("lblAgentChecking")}</span>
                ) : agentStatus === "online" ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    {t("lblOnlineLearningMode")}
                  </span>
                ) : agentStatus === "offline" ? (
                  <span className="flex items-center gap-1 text-xs text-yellow-500">
                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                    {t("lblOfflinePending")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <span className="w-2 h-2 rounded-full bg-destructive"></span>
                    {t("lblNoAgentSetup")}
                  </span>
                )}
              </div>
            </div>
            {agentStatus !== "none" && agentId && (
              <Button
                variant="ghost"
                size="icon"
                title={t("lblClearChat")}
                onClick={handleClearChat}
                disabled={isCompressing}
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0 p-4">
            <div className="space-y-4">
              {messages.map((msg) => {
                if (msg.role === "system") {
                  return (
                    <div key={msg.id} className="flex justify-center my-2 w-full">
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 max-w-[90%] text-center font-medium">
                        <Bot className="w-3.5 h-3.5 shrink-0" />
                        <span>{msg.content}</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-muted">
                      {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0 max-w-[calc(100%-2.5rem)]">
                      <div
                        className={`p-3 rounded-2xl text-sm min-w-0 ${
                          msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none border"
                        }`}
                      >
                        {msg.role === "user" ? (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        ) : (
                          <ChatMessageContent content={msg.content} />
                        )}
                      </div>
                      <div
                        className={`flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 px-1 ${
                          msg.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <span>{msg.timestamp || getFormattedTime()}</span>
                        {msg.id !== "1" && (
                          <>
                            <span className="text-zinc-300 dark:text-zinc-700">•</span>
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              className="hover:text-primary transition-colors flex items-center gap-0.5 focus:outline-none"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-green-500" />
                                  <span className="text-green-500 font-medium">{t("lblCopied")}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{t("lblCopy")}</span>
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t bg-background shrink-0">
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!isCompressing) {
                      handleSend();
                    }
                  }
                }}
                placeholder={
                  isCompressing
                    ? t("lblPlaceholderCompressing")
                    : promptUsage !== null
                      ? t("lblPlaceholderInputUsage").replace("{usage}", String(promptUsage))
                      : t("lblPlaceholderInput")
                }
                disabled={isCompressing}
                className="resize-none pr-12 h-20 bg-muted/50 focus-visible:ring-primary disabled:opacity-50"
              />
              <Button size="icon" className="absolute right-2 bottom-2 h-8 w-8" onClick={handleSend} disabled={!input.trim() || isCompressing}>
                {isCompressing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            {agentStatus === "none" && (
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                <span className="cursor-pointer text-primary hover:underline" onClick={() => navigate("/settings")}>
                  {t("lblNoAgentConnection")}
                </span>
              </p>
            )}
          </div>
        </aside>
      )}

      <Dialog open={showCheckpointDialog} onOpenChange={setShowCheckpointDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500 font-bold">
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-500 animate-bounce" />
              {t("lblCheckpointGuidance")}
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm text-foreground/80 leading-relaxed font-normal">
              {t("lblCheckpointGuidanceDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-between items-center w-full">
            {canSkipCheckpoint ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCheckpointDialog(false);
                  handleSkipCheckpoint();
                }}
                className="text-amber-700 hover:text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 font-semibold text-xs"
              >
                {t("btnSkipCheckpoint")}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCheckpointDialog(false)}>
                {t("lblClose")}
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
                onClick={() => {
                  if (currentCardFilename) {
                    setDismissedCheckpointPopups((prev) => new Set(prev).add(currentCardFilename));
                  }
                  setShowCheckpointDialog(false);
                  if (checkpoint) {
                    startCheckpointQnA(checkpoint);
                  }
                }}
              >
                {t("btnStartQna")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
