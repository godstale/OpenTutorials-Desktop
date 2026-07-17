import { isValidElement, useEffect, useRef, useState } from "react";
import type { ImgHTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { db } from "@/lib/db/client";

function PreBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState("code");
  const codeRef = useRef<string>("");

  useEffect(() => {
    if (isValidElement(children)) {
      const codeProps = children.props as any;
      if (codeProps?.children) {
        codeRef.current = String(codeProps.children).trim();
      }
      if (codeProps?.className) {
        const match = codeProps.className.match(/language-(\w+)/);
        if (match) setLanguage(match[1]);
      }
    }
  }, [children]);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeText = isValidElement(children) ? String((children.props as any).children).trim() : "";

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm font-mono text-xs max-w-full">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-[10px] text-zinc-400 font-semibold tracking-wider uppercase">
        <span>{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-zinc-100 transition-colors p-1 rounded"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-500" />
              <span className="text-emerald-500 text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-left leading-normal max-w-full m-0 bg-transparent">
        <code className="text-zinc-100 p-0 bg-transparent border-0 font-mono text-xs sm:text-sm">{codeText}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children, className, ...props }: any) {
  const isInline = !className;
  if (isInline) {
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-muted/80 text-primary dark:text-zinc-200 font-mono text-xs border border-zinc-200/50 dark:border-zinc-700/50 break-words"
        {...props}
      >
        {children}
      </code>
    );
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function resolveCourseImage(slug: string, src: string): string {
  const isRelative = !/^(?:https?:)?\/\/|^data:/i.test(src);
  if (!isRelative) return src;
  const imagesMatch = src.match(/(?:\.\.\/|\.\.\\|\/|\\|^)images[\/\\](.+)$/i);
  if (!imagesMatch) return src;
  const relPath = `${slug}/images/${imagesMatch[1].split(/[\\/]/).join("/")}`;
  return db.storage.from("courses").getPublicUrl(relPath).data.publicUrl;
}

const markdownComponents = (slug: string) => ({
  h1: (props: any) => <h1 className="text-lg sm:text-xl font-bold text-foreground mt-8 mb-4 border-b pb-2 tracking-tight" {...props} />,
  h2: (props: any) => <h2 className="text-base sm:text-lg font-bold text-foreground mt-6 mb-3 tracking-tight" {...props} />,
  h3: (props: any) => <h3 className="text-sm sm:text-base font-bold text-foreground mt-5 mb-2 tracking-tight" {...props} />,
  h4: (props: any) => <h4 className="text-sm font-semibold text-foreground mt-4 mb-2 tracking-tight" {...props} />,
  p: (props: any) => <p className="leading-7 text-foreground/80 [&:not(:first-child)]:mt-4 text-sm sm:text-base font-normal" {...props} />,
  ul: (props: any) => <ul className="my-4 ml-6 list-disc [&>li]:mt-2 text-sm sm:text-base text-foreground/80" {...props} />,
  ol: (props: any) => <ol className="my-4 ml-6 list-decimal [&>li]:mt-2 text-sm sm:text-base text-foreground/80" {...props} />,
  li: (props: any) => <li className="leading-7" {...props} />,
  blockquote: (props: any) => (
    <blockquote className="mt-4 border-l-4 border-primary/40 pl-4 italic text-muted-foreground bg-muted/20 py-2 rounded-r-md" {...props} />
  ),
  table: (props: any) => (
    <div className="my-6 w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm border-collapse text-left" {...props} />
    </div>
  ),
  thead: (props: any) => <thead className="bg-muted text-muted-foreground font-semibold border-b" {...props} />,
  tbody: (props: any) => <tbody className="divide-y divide-border" {...props} />,
  tr: (props: any) => <tr className="hover:bg-muted/50 transition-colors" {...props} />,
  th: (props: any) => <th className="px-4 py-3 font-semibold text-xs uppercase" {...props} />,
  td: (props: any) => <td className="px-4 py-3 text-sm text-foreground/90 font-normal align-middle" {...props} />,
  pre: PreBlock,
  code: InlineCode,
  img: (props: ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props;
    const resolvedSrc = src && typeof src === "string" ? resolveCourseImage(slug, src) : src;
    return (
      <img
        src={resolvedSrc}
        alt={alt}
        className="rounded-lg shadow-md mx-auto max-w-full my-4 border border-zinc-200/50 dark:border-zinc-800/50"
        {...rest}
      />
    );
  },
});

interface MarkdownCardProps {
  slug: string;
  content: string;
}

export function MarkdownCard({ slug, content }: MarkdownCardProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(slug) as any}>
      {content}
    </ReactMarkdown>
  );
}
