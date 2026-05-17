"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MARKDOWN_BODY =
  "prose prose-invert max-w-none prose-sm " +
  "prose-headings:text-[#e6edf3] prose-headings:font-semibold prose-headings:tracking-tight " +
  "prose-h2:text-base prose-h2:mt-6 prose-h2:mb-3 prose-h2:border-b prose-h2:border-[#30363d] prose-h2:pb-2 prose-h2:first:mt-0 " +
  "prose-h3:text-sm prose-h3:mt-4 " +
  "prose-p:text-[#c9d1d9] prose-p:leading-relaxed " +
  "prose-li:text-[#c9d1d9] prose-li:marker:text-[#8b949e] " +
  "prose-strong:text-[#e6edf3] " +
  "prose-a:text-[#58a6ff] prose-a:font-normal prose-a:no-underline hover:prose-a:underline " +
  "prose-code:text-[#79c0ff] prose-code:bg-[#161b22] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-medium " +
  "prose-code:before:content-none prose-code:after:content-none " +
  "prose-pre:bg-[#0d1117] prose-pre:text-[#c9d1d9] prose-pre:border prose-pre:border-[#30363d] prose-pre:rounded-lg prose-pre:shadow-inner " +
  "prose-blockquote:border-l-[#3d444d] prose-blockquote:text-[#8b949e] " +
  "prose-table:text-sm prose-th:border prose-th:border-[#30363d] prose-th:bg-[#161b22] prose-td:border prose-td:border-[#30363d] " +
  "prose-hr:border-[#30363d]";

export function MarkdownBody({ content }: { content: string }) {
  return (
    <div className={MARKDOWN_BODY}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
