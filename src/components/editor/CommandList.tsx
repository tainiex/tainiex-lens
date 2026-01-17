import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import './CommandList.css';

interface CommandItem {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    command: (editor: any, range: any) => void;
}

interface CommandListProps {
    items: CommandItem[];
    command: (item: CommandItem) => void;
}

export const CommandList = forwardRef((props: CommandListProps, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
        const item = props.items[index];
        if (item) {
            props.command(item);
        }
    };

    const upHandler = () => {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
    };

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
        selectItem(selectedIndex);
    };

    useEffect(() => {
        // Defer state update to avoid flushSync warning during rendering
        queueMicrotask(() => {
            setSelectedIndex(0);
        });
    }, [props.items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                upHandler();
                return true;
            }

            if (event.key === 'ArrowDown') {
                downHandler();
                return true;
            }

            if (event.key === 'Enter') {
                enterHandler();
                return true;
            }

            return false;
        },
    }));

    return (
        <div className="slash-command-menu">
            {props.items.length ? (
                props.items.map((item, index) => (
                    <button
                        className={`slash-command-item ${index === selectedIndex ? 'is-selected' : ''}`}
                        key={index}
                        onClick={() => selectItem(index)}
                        onMouseEnter={() => setSelectedIndex(index)}
                    >
                        {item.icon && <span className="item-icon">{item.icon}</span>}
                        <div className="item-content">
                            <div className="item-title">{item.title}</div>
                            {item.description && (
                                <div className="item-desc">{item.description}</div>
                            )}
                        </div>
                    </button>
                ))
            ) : (
                <div className="slash-command-empty">No result</div>
            )}
        </div>
    );
});

CommandList.displayName = 'CommandList';
