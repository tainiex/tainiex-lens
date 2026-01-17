import { useState, useRef, useEffect } from 'react';
import './ModelSelector.css';

interface Model {
    name: string;
}

interface ModelSelectorProps {
    models: (string | Model)[];
    selectedModel: string;
    onSelect: (model: string) => void;
    disabled?: boolean;
    dropUp?: boolean;
}

const ModelSelector = ({
    models,
    selectedModel,
    onSelect,
    disabled,
    dropUp,
}: ModelSelectorProps) => {
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
        <div className="model-selector" ref={dropdownRef}>
            <button
                type="button"
                className="model-selector-btn"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                <span>{selectedModel || 'Select Model'}</span>
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`model-selector-arrow ${isOpen ? 'open' : ''}`}
                >
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>

            {isOpen && (
                <>
                    <div className="model-selector-backdrop" onClick={() => setIsOpen(false)} />
                    <div className={`model-dropdown-menu ${dropUp ? 'drop-up' : ''}`}>
                        {models.map((model, idx) => {
                            const name = getModelName(model);
                            return (
                                <button
                                    key={`${name}-${idx}`}
                                    type="button"
                                    className={`model-option ${name === selectedModel ? 'selected' : ''}`}
                                    onClick={() => handleSelect(name)}
                                >
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default ModelSelector;
