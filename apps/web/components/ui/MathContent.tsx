"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { renderMathInHtml } from "@/lib/math-render";
import { cn } from "@/lib/utils";

interface MathContentProps {
  content: string;
  className?: string;
}

/**
 * Checks if the content is primarily HTML (e.g. from TipTap / WYSIWYG)
 * or raw Markdown.
 */
function isHtmlContent(text: string): boolean {
  const trimmed = text.trim();
  return /<\/?(p|div|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|pre|code|span|strong|em|br|hr)[^>]*>/i.test(
    trimmed,
  );
}

export default function MathContent({ content, className }: MathContentProps) {
  const isHtml = useMemo(() => isHtmlContent(content || ""), [content]);

  const renderedHtml = useMemo(() => {
    if (!content) return "";
    if (isHtml) {
      return renderMathInHtml(content);
    }
    return "";
  }, [content, isHtml]);

  if (!content) {
    return null;
  }

  // If content is HTML from WYSIWYG editor, render processed KaTeX HTML
  if (isHtml) {
    return (
      <div
        className={cn(
          "prose prose-sm sm:prose-base max-w-none text-text-primary break-words [overflow-wrap:anywhere]",
          "[&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary-hover [&_a]:break-all",
          "[&_p]:mb-3 [&_p:last-child]:mb-0",
          "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1",
          "[&_strong]:font-bold [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h4]:text-sm",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:bg-primary/5 [&_blockquote]:py-2 [&_blockquote]:px-4 [&_blockquote]:rounded-r-lg [&_blockquote]:italic [&_blockquote]:my-3",
          "[&_table]:w-full [&_table]:border-collapse [&_table]:my-4",
          "[&_th]:border-b [&_th]:border-border-default [&_th]:bg-bg-secondary [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-left",
          "[&_td]:border-b [&_td]:border-border-subtle [&_td]:px-3 [&_td]:py-2",
          "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1",
          "[&_.katex]:text-text-primary",
          className,
        )}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  }

  // If content is Markdown, render via ReactMarkdown with GFM + KaTeX math
  return (
    <div
      className={cn(
        "prose prose-sm sm:prose-base max-w-none text-text-primary break-words [overflow-wrap:anywhere]",
        "[&_a]:break-all",
        "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1",
        "[&_.katex]:text-text-primary",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: "ignore" }]]}
        components={{
          table: ({ ...props }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-border-default">
              <table
                className="w-full border-collapse text-left text-sm"
                {...props}
              />
            </div>
          ),
          th: ({ ...props }) => (
            <th
              className="border-b border-border-default bg-bg-secondary px-4 py-2.5 font-semibold text-text-primary"
              {...props}
            />
          ),
          td: ({ ...props }) => (
            <td
              className="border-b border-border-subtle px-4 py-2.5 text-text-secondary"
              {...props}
            />
          ),
          blockquote: ({ ...props }) => (
            <blockquote
              className="border-l-4 border-primary/50 bg-primary/5 py-2 px-4 rounded-r-lg italic my-3 text-text-secondary"
              {...props}
            />
          ),
          a: ({ ...props }) => (
            <a
              className="text-primary underline hover:text-primary-hover transition-colors break-all"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          code: ({ className, children, ...props }) => {
            const isInline =
              !className &&
              typeof children === "string" &&
              !children.includes("\n");
            if (isInline) {
              return (
                <code
                  className="rounded bg-bg-secondary px-1.5 py-0.5 text-xs font-mono text-primary font-semibold"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-4 overflow-x-auto rounded-xl border border-border-default bg-bg-secondary/80 p-4 font-mono text-xs text-text-primary">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
