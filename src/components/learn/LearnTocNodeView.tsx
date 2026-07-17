import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TocNode } from "@/lib/types/course";

function isAncestorOfActiveCard(
  node: TocNode,
  activeCardIndex: number,
  nodeToIndexMap: Map<TocNode, number>,
): boolean {
  if (node.filename) {
    return nodeToIndexMap.get(node) === activeCardIndex;
  }
  if (node.children) {
    for (const child of node.children) {
      if (isAncestorOfActiveCard(child, activeCardIndex, nodeToIndexMap)) {
        return true;
      }
    }
  }
  return false;
}

function getIndentClass(depth: number): string {
  switch (depth) {
    case 0:
      return "";
    case 1:
      return "ml-3 border-l pl-2 border-zinc-200 dark:border-zinc-800";
    case 2:
      return "ml-5 border-l pl-2 border-zinc-200 dark:border-zinc-800";
    default:
      return "ml-7 border-l pl-2 border-zinc-200 dark:border-zinc-800";
  }
}

function getTypeStyle(type: string): string {
  switch (type) {
    case "chapter":
      return "text-[11px] sm:text-xs font-bold text-foreground py-2 border-b border-zinc-100 dark:border-zinc-900";
    case "section":
      return "text-[10px] sm:text-[11px] font-semibold text-foreground/80 py-1.5";
    default:
      return "text-[9px] sm:text-[10px] font-medium text-muted-foreground py-1";
  }
}

interface LearnTocNodeViewProps {
  node: TocNode;
  depth: number;
  nodeToIndexMap: Map<TocNode, number>;
  maxUnlockedIndex: number;
  currentCardIndex: number;
  isCourseCompleted: boolean;
  onSelectCard: (index: number) => void;
}

export function LearnTocNodeView({
  node,
  depth,
  nodeToIndexMap,
  maxUnlockedIndex,
  currentCardIndex,
  isCourseCompleted,
  onSelectCard,
}: LearnTocNodeViewProps) {
  const hasChildren = !!node.children && node.children.length > 0;
  const isLeaf = !!node.filename;

  const [isExpanded, setIsExpanded] = useState(
    () => hasChildren && isAncestorOfActiveCard(node, currentCardIndex, nodeToIndexMap),
  );

  useEffect(() => {
    if (hasChildren && isAncestorOfActiveCard(node, currentCardIndex, nodeToIndexMap)) {
      setIsExpanded(true);
    }
  }, [currentCardIndex, node, hasChildren, nodeToIndexMap]);

  if (isLeaf) {
    const idx = nodeToIndexMap.get(node) ?? 0;
    const isUnlocked = idx <= maxUnlockedIndex;
    const isActive = idx === currentCardIndex;
    const isCompleted = idx < maxUnlockedIndex || isCourseCompleted;

    return (
      <div className={getIndentClass(depth)}>
        <button
          disabled={!isUnlocked}
          onClick={() => onSelectCard(idx)}
          className={cn(
            "w-full text-left p-2 rounded-md flex items-center gap-2.5 transition-all text-xs relative group my-0.5",
            isActive
              ? "bg-primary/10 text-primary font-semibold border-l-4 border-primary pl-1.5 rounded-l-none"
              : isUnlocked
                ? "hover:bg-muted text-foreground cursor-pointer border-l-4 border-transparent"
                : "text-muted-foreground/60 cursor-not-allowed opacity-50 border-l-4 border-transparent",
          )}
        >
          <span
            className={cn(
              "w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0 font-bold border",
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : isCompleted
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : isUnlocked
                    ? "bg-muted text-foreground border-zinc-300 dark:border-zinc-700"
                    : "bg-muted text-muted-foreground/40 border-transparent",
            )}
          >
            {isCompleted && !isActive ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate font-medium text-[11px]", isActive ? "text-primary font-bold" : "text-foreground")}>
              {node.title}
            </p>
          </div>
          {!isUnlocked && <Lock className="w-2.5 h-2.5 shrink-0 text-muted-foreground/40" />}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${getIndentClass(depth)}`}>
      <div
        onClick={() => hasChildren && setIsExpanded((prev) => !prev)}
        className={`flex items-start justify-between transition-colors w-full text-left rounded-md ${
          hasChildren ? "cursor-pointer hover:bg-muted/10" : ""
        } ${getTypeStyle(node.type)}`}
      >
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          <span className="mt-0.5 shrink-0 text-muted-foreground">
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
          <div className="flex-1 min-w-0">
            <h4 className="leading-snug truncate">{node.title}</h4>
          </div>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="mt-0.5 flex flex-col">
          {node.children!.map((child, idx) => (
            <LearnTocNodeView
              key={`${child.title}-${idx}`}
              node={child}
              depth={depth + 1}
              nodeToIndexMap={nodeToIndexMap}
              maxUnlockedIndex={maxUnlockedIndex}
              currentCardIndex={currentCardIndex}
              isCourseCompleted={isCourseCompleted}
              onSelectCard={onSelectCard}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function getLeafNodes(nodes: TocNode[], list: TocNode[] = []): TocNode[] {
  for (const node of nodes) {
    if (node.filename) {
      list.push(node);
    }
    if (node.children) {
      getLeafNodes(node.children, list);
    }
  }
  return list;
}
