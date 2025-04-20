import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
        // Style headers
        h1: ({ node, ...props }) => <h1 className="text-2xl font-bold my-4" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-xl font-bold my-3" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-lg font-bold my-2" {...props} />,
        
        // Style lists
        ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2" {...props} />,
        li: ({ node, ...props }) => <li className="my-1" {...props} />,
        
        // Style code blocks and inline code
        code: ({ node, className, children, ...props }: any) => {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;
          return isInline 
            ? <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
            : <code className="block bg-gray-100 p-2 rounded text-sm font-mono my-2 overflow-x-auto" {...props}>{children}</code>;
        },
        
        // Style blockquotes
        blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2" {...props} />,
        
        // Style links
        a: ({ node, ...props }) => <a className="text-butler-primary hover:underline" {...props} />,
        
        // Style tables
        table: ({ node, ...props }) => <table className="border-collapse my-4 w-full" {...props} />,
        thead: ({ node, ...props }) => <thead className="bg-gray-100" {...props} />,
        th: ({ node, ...props }) => <th className="border border-gray-300 px-4 py-2 text-left" {...props} />,
        td: ({ node, ...props }) => <td className="border border-gray-300 px-4 py-2" {...props} />,
      }}
    >
      {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
