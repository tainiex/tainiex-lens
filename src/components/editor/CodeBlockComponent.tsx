import { NodeViewContent, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import React, { useState, useRef, useEffect } from 'react';
import './CodeBlockComponent.css';

export const CodeBlockComponent: React.FC<NodeViewProps> = ({
    node: {
        attrs: { language: defaultLanguage },
    },
    updateAttributes,
    extension,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    // @ts-ignore
    const languages = extension.options.lowlight.listLanguages();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleLanguageSelect = (lang: string) => {
        updateAttributes({ language: lang });
        setIsOpen(false);
    };

    const currentLanguage =
        defaultLanguage === 'null' || !defaultLanguage ? 'auto' : defaultLanguage;

    return (
        <NodeViewWrapper className="code-block-wrapper">
            <div className="code-block-header">
                <div className="code-block-lang-container" ref={containerRef}>
                    <button
                        className={`code-block-lang-trigger ${isOpen ? 'is-open' : ''}`}
                        onClick={() => setIsOpen(!isOpen)}
                        contentEditable={false}
                    >
                        {currentLanguage}
                        <svg
                            className="chevron-icon"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>

                    {isOpen && (
                        <div className="code-block-lang-dropdown" contentEditable={false}>
                            <div
                                className={`lang-option ${currentLanguage === 'auto' ? 'selected' : ''}`}
                                onClick={() => handleLanguageSelect('null')}
                            >
                                auto
                            </div>
                            {languages.map((lang: string, index: number) => (
                                <div
                                    key={index}
                                    className={`lang-option ${currentLanguage === lang ? 'selected' : ''}`}
                                    onClick={() => handleLanguageSelect(lang)}
                                >
                                    {lang}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="code-block-actions">
                    <button
                        className="copy-btn"
                        onClick={e => {
                            const code = (e.target as HTMLElement)
                                .closest('.code-block-wrapper')
                                ?.querySelector('code')?.innerText;
                            if (code) navigator.clipboard.writeText(code);
                        }}
                        title="Copy code"
                        contentEditable={false} // Ensure triggers specific Tiptap behavior ignore
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <pre>
                <NodeViewContent as={'code' as any} />
            </pre>
        </NodeViewWrapper>
    );
};
