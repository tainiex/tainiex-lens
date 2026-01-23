import React, { useState } from 'react';

interface ToolExecutionProps {
    toolName: string;
    parameters: any;
}

const ToolExecution: React.FC<ToolExecutionProps> = ({ toolName, parameters }) => {
    const [expanded, setExpanded] = useState(false);

    // Format tool name for display (e.g. get_weather -> Get Weather)
    const displayName = toolName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    return (
        <div
            className="tool-execution-card"
            style={{
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                margin: '8px 0',
                overflow: 'hidden',
                backgroundColor: '#f9f9f9',
                fontSize: '0.85rem',
                maxWidth: '100%',
                userSelect: 'none',
            }}
        >
            <div
                className="tool-header"
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    gap: '8px',
                    backgroundColor: '#fff',
                }}
            >
                <div
                    className="tool-icon"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        borderRadius: '4px',
                    }}
                >
                    {/* Generic Tool Icon (Wrench/Gear) */}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                    </svg>
                </div>
                <div style={{ flex: 1, fontWeight: 500, color: '#333' }}>Used {displayName}</div>
                <div
                    style={{
                        color: '#999',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </div>
            </div>

            {expanded && (
                <div
                    className="tool-details"
                    style={{
                        padding: '12px',
                        borderTop: '1px solid #eee',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        overflowX: 'auto',
                    }}
                >
                    <div style={{ marginBottom: '4px', color: '#666', fontWeight: 600 }}>
                        Input Parameters:
                    </div>
                    <pre
                        style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            color: '#444',
                        }}
                    >
                        {JSON.stringify(parameters, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};

export default ToolExecution;
