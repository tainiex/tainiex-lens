import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TypewriterEffectProps {
    content: string;
    isStreaming?: boolean;
}

const TypewriterEffect = ({ content, isStreaming }: TypewriterEffectProps) => {
    const [displayedContent, setDisplayedContent] = useState('');
    const indexRef = useRef(0);
    const contentRef = useRef(content);
    const isFirstMount = useRef(true);

    // Sync content ref
    useEffect(() => {
        contentRef.current = content;
        // If content length decreases significantly, reset (new session or message change)
        if (content.length < indexRef.current) {
            indexRef.current = 0;
            setDisplayedContent('');
        }
    }, [content]);

    useEffect(() => {
        // Force start from 0 on mount if it's a new instance/message
        if (isFirstMount.current) {
            indexRef.current = 0;
            isFirstMount.current = false;
        }

        const intervalId = setInterval(() => {
            const currentContent = contentRef.current;
            const targetLen = currentContent.length;
            const currentLen = indexRef.current;

            if (currentLen < targetLen) {
                const diff = targetLen - currentLen;

                // adaptive speed
                let step = 1;
                if (diff > 100) step = 10;
                else if (diff > 50) step = 6;
                else if (diff > 20) step = 3;
                else if (diff > 5) step = 2;

                // Even if not streaming anymore, we MUST finish typing
                if (!isStreaming) {
                    step = Math.max(step, 15); // Fast catch up but still typed
                }

                const nextLen = Math.min(targetLen, currentLen + step);
                indexRef.current = nextLen;
                setDisplayedContent(currentContent.slice(0, nextLen));
            }
        }, 25);

        return () => clearInterval(intervalId);
    }, [isStreaming]); // Restart on stream end is fine, will trigger fast catch-up block

    return (
        <div className={`typewriter-container ${isStreaming ? 'streaming' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayedContent}
            </ReactMarkdown>
        </div>
    );
};

export default TypewriterEffect;
