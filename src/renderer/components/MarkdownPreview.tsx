import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownPreviewProps {
  content: string;
  workingDir: string;
}

export default function MarkdownPreview({ content, workingDir }: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Resolve relative paths to absolute URLs
  const resolvePath = (uri: string | null | undefined) => {
    if (!uri || uri.startsWith('http') || uri.startsWith('//') || uri.startsWith('data:')) return uri || '';
    const absPath = workingDir + '/' + uri;
    return absPath;
  };

  // Open links in system browser
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.href;
    if (href.startsWith('http')) {
      window.open(href, '_blank');
    }
  };

  return (
    <div ref={containerRef} className="markdown-preview h-full overflow-y-auto px-8 py-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, children }) => (
            <a href={href} onClick={handleLinkClick} className="text-blue-400 hover:underline">
              {children}
            </a>
          ),
          img: ({ src, alt, width }) => (
            <img src={resolvePath(src)} alt={alt} className="max-w-full rounded-lg border border-border my-4" />
          ),
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isBlock = className?.includes('lang-');
            return isBlock ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="bg-white/8 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-black/30 border border-border rounded-lg p-4 overflow-x-auto my-4">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="w-full border-collapse border border-border">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-white/5 font-semibold text-left px-3 py-2 border border-border text-sm">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border border-border text-sm text-text-secondary">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-accent pl-4 my-4 text-text-muted italic">{children}</blockquote>
          ),
          hr: () => <hr className="border-none border-t border-border my-6" />,
          ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1 text-text-secondary">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1 text-text-secondary">{children}</ol>,
          li: ({ children }) => <li className="text-text-secondary">{children}</li>,
          h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 pb-2 border-b border-border">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mt-6 mb-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mt-5 mb-2">{children}</h3>,
          h4: ({ children }) => <h4 className="text-base font-semibold mt-4 mb-2">{children}</h4>,
          h5: ({ children }) => <h5 className="text-sm font-semibold mt-3 mb-1">{children}</h5>,
          h6: ({ children }) => <h6 className="text-sm font-semibold mt-3 mb-1 text-text-muted">{children}</h6>,
          p: ({ children }) => <p className="mb-4 leading-relaxed text-text-secondary">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
