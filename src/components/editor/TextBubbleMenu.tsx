import React from 'react';
import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import './TextBubbleMenu.css';

interface TextBubbleMenuProps {
    editor: Editor;
}

export const TextBubbleMenu: React.FC<TextBubbleMenuProps> = ({ editor }) => {
    // Helper to check if node is active
    const isNodeActive = (type: string, attributes?: Record<string, any>) =>
        editor.isActive(type, attributes);

    // Helper to check if mark is active
    const isMarkActive = (type: string, attributes?: Record<string, any>) =>
        editor.isActive(type, attributes);

    const toggleBold = () => editor.chain().focus().toggleBold().run();
    const toggleItalic = () => editor.chain().focus().toggleItalic().run();
    const toggleStrike = () => editor.chain().focus().toggleStrike().run();
    const toggleCode = () => editor.chain().focus().toggleCode().run();

    // Toggle Heading
    const toggleHeading = (level: 1 | 2 | 3) =>
        editor.chain().focus().toggleHeading({ level }).run();

    // Set Color
    const setColor = (color: string) => editor.chain().focus().setColor(color).run();
    const resetColor = () => editor.chain().focus().unsetColor().run();

    // Prompt for Link
    const setLink = () => {
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('URL', previousUrl);

        // cancelled
        if (url === null) {
            return;
        }

        // empty
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        // update
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    return (
        <BubbleMenu
            editor={editor}
            shouldShow={({ editor, from, to }) => {
                // Determine if we should show the menu:
                // 1. Selection is not empty
                // 2. Editor is editable
                // 3. Not in a code block? (Maybe we want it there too for bold/italic in comments?)
                // Let's stick to default behavior but exclude cell selections which have their own menu.
                // WE MUST CHECK if `from === to` (empty selection)
                if (from === to) return false;

                // Hide for images (NodeSelection)
                if (editor.isActive('image')) {
                    return false;
                }

                // Check if CellSelection (handled by Table BubbleMenu)
                // Note: We need to import CellSelection to check properly,
                // OR we check if the table bubble menu logic would catch it.
                // Easier check: Is the selection content text?
                return !editor.state.selection.empty;
            }}
            className="text-bubble-menu"
        >
            {/* Formatting Group */}
            <div className="menu-group">
                <button
                    onClick={toggleBold}
                    className={isMarkActive('bold') ? 'is-active' : ''}
                    title="Bold"
                >
                    B
                </button>
                <button
                    onClick={toggleItalic}
                    className={isMarkActive('italic') ? 'is-active' : ''}
                    title="Italic"
                >
                    I
                </button>
                <button
                    onClick={toggleStrike}
                    className={isMarkActive('strike') ? 'is-active' : ''}
                    title="Strike"
                >
                    S
                </button>
                <button
                    onClick={toggleCode}
                    className={isMarkActive('code') ? 'is-active' : ''}
                    title="Code"
                >
                    &lt;/&gt;
                </button>
                <button
                    onClick={setLink}
                    className={isMarkActive('link') ? 'is-active' : ''}
                    title="Link"
                >
                    🔗
                </button>
            </div>

            <div className="menu-divider" />

            {/* Turn Into Group */}
            <div className="menu-group">
                <button
                    onClick={() => toggleHeading(1)}
                    className={isNodeActive('heading', { level: 1 }) ? 'is-active' : ''}
                    title="Heading 1"
                >
                    H1
                </button>
                <button
                    onClick={() => toggleHeading(2)}
                    className={isNodeActive('heading', { level: 2 }) ? 'is-active' : ''}
                    title="Heading 2"
                >
                    H2
                </button>
            </div>

            <div className="menu-divider" />

            {/* Color Group */}
            <div className="menu-group color-group">
                <button onClick={resetColor} className="color-btn default" title="Default"></button>
                <button
                    onClick={() => setColor('#ef4444')}
                    className="color-btn red"
                    title="Red"
                ></button>
                <button
                    onClick={() => setColor('#eab308')}
                    className="color-btn yellow"
                    title="Yellow"
                ></button>
                <button
                    onClick={() => setColor('#22c55e')}
                    className="color-btn green"
                    title="Green"
                ></button>
                <button
                    onClick={() => setColor('#3b82f6')}
                    className="color-btn blue"
                    title="Blue"
                ></button>
            </div>
        </BubbleMenu>
    );
};
