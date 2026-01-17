import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { CommandList } from '../CommandList';

export const SlashCommand = Extension.create({
    name: 'slashCommand',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                command: ({ editor, range, props }: any) => {
                    props.command({ editor, range });
                },
            },
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ];
    },
});

export const getSuggestionItems = ({ query }: { query: string }) => {
    return [
        {
            title: 'Text',
            description: 'Just start writing with plain text.',
            icon: 'T',
            command: ({ editor, range }: any) => {
                editor
                    .chain()
                    .focus()
                    .deleteRange(range)
                    .toggleNode('paragraph', 'paragraph')
                    .run();
            },
        },
        {
            title: 'Heading 1',
            description: 'Big section heading.',
            icon: 'H1',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
            },
        },
        {
            title: 'Heading 2',
            description: 'Medium section heading.',
            icon: 'H2',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
            },
        },
        {
            title: 'Heading 3',
            description: 'Small section heading.',
            icon: 'H3',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
            },
        },
        {
            title: 'Bullet List',
            description: 'Create a simple bulleted list.',
            icon: '•',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run();
            },
        },
        {
            title: 'Ordered List',
            description: 'Create a list with numbering.',
            icon: '1.',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleOrderedList().run();
            },
        },
        {
            title: 'To-do List',
            description: 'Track tasks with a todo list.',
            icon: '[]',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleTaskList().run();
            },
        },
        {
            title: 'Code Block',
            description: 'Capture a code snippet.',
            icon: '</>',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
            },
        },
        {
            title: 'Image',
            description: 'Upload an image from your computer.',
            icon: '🖼️',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).run();
                // Create a temporary file input
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async () => {
                    if (input.files?.length) {
                        const file = input.files[0];
                        // We need noteId to upload.
                        // Since SlashCommand is just a config, we might not have direct access to noteId here unless passed in context.
                        // However, we can use a custom event or a global handler, OR (preferred)
                        // we can handle the upload here IF we can get the noteId.

                        // For now, let's dispatch a custom event that NoteEditor listens to?
                        // Or, simpler: Just trigger the same logic as drop/paste if we can.

                        // Check if we can access the editor's storage or context?
                        // Tiptap editor object doesn't carry arbitrary props easily.

                        // Alternative: Dispatch a custom event on the editor's DOM element
                        const uploadEvent = new CustomEvent('editor:upload-image', {
                            detail: { file, pos: editor.state.selection.from },
                        });
                        editor.view.dom.dispatchEvent(uploadEvent);
                    }
                };
                input.click();
            },
        },
        {
            title: 'Blockquote',
            description: 'Capture a quote.',
            icon: '“',
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBlockquote().run();
            },
        },
    ]
        .filter(item => item.title.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 10);
};

export const renderItems = () => {
    let component: ReactRenderer | null = null;
    let popup: any | null = null;

    return {
        onStart: (props: any) => {
            component = new ReactRenderer(CommandList, {
                props,
                editor: props.editor,
            });

            if (!props.clientRect) {
                return;
            }

            // Create a dummy element for positioning if clientRect returns null sometimes
            // but usually clientRect() gives a DOMRect.
            // Tippy needs an element or a virtual element.
            // Using getReferenceClientRect directly is standard for text selections.

            popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
            });
        },

        onUpdate: (props: any) => {
            component?.updateProps(props);

            if (!props.clientRect) {
                return;
            }

            popup[0].setProps({
                getReferenceClientRect: props.clientRect,
            });
        },

        onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
                popup[0].hide();
                return true;
            }

            return (component?.ref as any)?.onKeyDown(props);
        },

        onExit: () => {
            popup[0].destroy();
            component?.destroy();
        },
    };
};
