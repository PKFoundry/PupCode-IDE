import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check } from 'lucide-react';

interface ChatMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

export default function ChatMarkdown({ content, isStreaming }: ChatMarkdownProps) {
  return (
    <div className="markdown-chat-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.includes('language-');
            return isBlock ? (
              <code className={className}>{children}</code>
            ) : (
              <code>{children}</code>
            );
          },
          pre: ({ children }) => {
            if (isStreaming) return <pre>{children}</pre>;
            return <CodeBlockWithCopy>{children}</CodeBlockWithCopy>;
          },
          table: ({ children }) => (
            <div className="table-wrapper">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Wraps a code block with a copy-to-clipboard button. */
function CodeBlockWithCopy({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // Extract text from the pre element children
      const text = extractTextFromChildren(children);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may not be available
    }
  };

  return (
    <div className="relative group">
      <pre>{children}</pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        title="Copy code"
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
      >
        {copied ? (
          <Check className="w-3 h-3" style={{ color: 'var(--success)' }} />
        ) : (
          <Copy className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
        )}
      </button>
    </div>
  );
}

/** Recursively extract text content from React children. */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (typeof children === 'object' && children !== null && 'props' in children) {
    const child = children as React.ReactElement;
    return extractTextFromChildren(child.props.children);
  }
  return '';
}
