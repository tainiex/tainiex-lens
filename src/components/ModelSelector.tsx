import { useState, useRef, useEffect } from 'react';

interface Model {
    name: string;
}

interface ModelSelectorProps {
    models: (string | Model)[];
    selectedModel: string;
    onSelect: (model: string) => void;
    disabled?: boolean;
}

const ModelSelector = ({ models, selectedModel, onSelect, disabled }: ModelSelectorProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const getModelName = (model: string | Model) => {
        return typeof model === 'string' ? model : model.name;
    };

    const handleSelect = (modelName: string) => {
        onSelect(modelName);
        setIsOpen(false);
    };

    return (
        <div className="model-selector" ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                type="button"
                className="model-selector-btn"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: '#1a1a1a',
                    color: '#e0e0e0',
                    fontSize: '0.85rem',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.2s'
                }}
            >
                <span style={{ fontWeight: 500 }}>{selectedModel || 'Select Model'}</span>
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                    }}
                >
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>

            {isOpen && (
                <div
                    className="model-dropdown-menu"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '4px',
                        minWidth: '180px',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        zIndex: 100,
                        overflow: 'hidden'
                    }}
                >
                    {models.map((model, idx) => {
                        const name = getModelName(model);
                        return (
                            <button
                                key={`${name}-${idx}`}
                                type="button"
                                onClick={() => handleSelect(name)}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 12px',
                                    background: name === selectedModel ? '#2a2a2a' : 'transparent',
                                    color: name === selectedModel ? '#fff' : '#aaa',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem'
                                }}
                            >
                                {name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ModelSelector;
