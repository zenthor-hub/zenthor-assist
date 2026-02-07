"use client";

import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-border mb-2 border-l-2 pl-3 italic last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded bg-black/10 p-3 text-xs dark:bg-white/10">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-black/10 px-1 py-0.5 text-xs dark:bg-white/10">{children}</code>
    );
  },
  pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-border border-b px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-border border-b px-2 py-1">{children}</td>,
};

const remarkPlugins = [remarkGfm];

interface MarkdownContentProps {
  content: string;
  streaming?: boolean;
}

export const MarkdownContent = React.memo(
  function MarkdownContent({ content, streaming }: MarkdownContentProps) {
    const rendered = useMemo(() => {
      if (streaming) return null;
      return (
        <Markdown remarkPlugins={remarkPlugins} components={components}>
          {content}
        </Markdown>
      );
    }, [content, streaming]);

    if (streaming) {
      return (
        <Markdown remarkPlugins={remarkPlugins} components={components}>
          {content}
        </Markdown>
      );
    }

    return rendered;
  },
  (prev, next) => {
    if (prev.streaming || next.streaming) return false;
    return prev.content === next.content;
  },
);
