/**
 * 协同笔记编辑器组件
 * Collaborative Note Editor Component
 * 
 * 基于 Tiptap + Y.js 的实时协同编辑器
 */

import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import CodeBlock from '@tiptap/extension-code-block';
import Blockquote from '@tiptap/extension-blockquote';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import { useEffect, useCallback, useState } from 'react';
import * as Y from 'yjs';
import { useCollaborationSocket } from '../hooks/useCollaborationSocket';
import { useYjsDocument } from '../hooks/useYjsDocument';
import NetworkStatusBar from './NetworkStatusBar';
import { logger } from '../utils/logger';
import type {
  YjsSyncPayload,
  YjsUpdatePayload,
  CursorUpdatePayload,
  PresenceUser,
  CollaborationLimitPayload,
} from '../types/collaboration';
import './NoteEditor.css';

interface NoteEditorProps {
  noteId?: string | null;
  initialContent?: string;
  title?: string;
  onChange?: (content: string) => void;
  onTitleChange?: (title: string) => void;
  editable?: boolean;
  onMobileMenuClick?: () => void;
}

// 内部 Tiptap 编辑器组件
const TiptapEditor = ({
  ydoc,
  initialContent,
  editable,
  isLimitReached,
  onChange,
  sendCursorUpdate,
  presenceUsers,
  isSyncing,
  noteId,
}: {
  ydoc: Y.Doc;
  initialContent: string;
  editable: boolean;
  isLimitReached: boolean;
  onChange?: (content: string) => void;
  sendCursorUpdate: (cursor: any) => void;
  presenceUsers: PresenceUser[];
  isSyncing: boolean;
  noteId: string | null;
}) => {
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Strike,
      Heading,
      BulletList,
      OrderedList,
      ListItem,
      CodeBlock,
      Blockquote,
      Placeholder.configure({
        placeholder: '开始编写你的笔记...',
      }),
      Collaboration.configure({
        document: ydoc,
      }),
    ],
    content: initialContent,
    editable: editable && !isLimitReached,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
      // Debug log to verify Tiptap update
      logger.debug('[Tiptap] Content updated');
    },
    onSelectionUpdate: ({ editor }) => {
      if (!noteId) return;
      const { from, to } = editor.state.selection;
      sendCursorUpdate({
        position: from,
        selectionStart: from,
        selectionEnd: to,
      });
    },
    onBlur: () => {
      sendCursorUpdate(null);
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor-content',
      },
    },
  });

  // 同步可编辑状态
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable && !isLimitReached);
    }
  }, [editor, editable, isLimitReached]);

  if (!editor) {
    return null;
  }

  return (
    <>
      {/* Editor Content */}

      {/* 编辑器内容 */}
      <EditorContent
        editor={editor}
        className={`editor-content-wrapper ${isSyncing ? 'syncing' : ''}`}
      />
    </>
  );
};

const NoteEditor = ({
  noteId = null,
  initialContent = '',
  title = '',
  onChange,
  onTitleChange,
  editable = true,
  onMobileMenuClick,
}: NoteEditorProps) => {
  const [collaborationError, setCollaborationError] = useState<string | null>(null);
  const [isLimitReached, setIsLimitReached] = useState(false);

  // Y.js 文档管理
  const {
    ydoc,
    isInitialized: isYjsInitialized,
    isSyncing,
    applyRemoteUpdate,
    applyInitialSync,
  } = useYjsDocument({
    noteId,
    onLocalUpdate: (update) => {
      logger.debug('[NoteEditor] Sending local update, size:', update.length);
      sendUpdate(update);
    },
  });

  // 协同 Socket 连接
  const {
    connectionState,
    presenceUsers,
    sendUpdate,
    sendCursorUpdate,
    reconnect,
  } = useCollaborationSocket({
    noteId,
    onSync: useCallback((payload: YjsSyncPayload) => {
      applyInitialSync(payload);
    }, [applyInitialSync]),
    onUpdate: useCallback((payload: YjsUpdatePayload) => {
      applyRemoteUpdate(payload);
    }, [applyRemoteUpdate]),
    onCursorUpdate: useCallback((_payload: CursorUpdatePayload) => {
      // TODO: 实现光标渲染
    }, []),
    onPresenceChange: useCallback((_users: PresenceUser[]) => {
      // Presence 变化由 hook 内部管理
    }, []),
    onLimit: useCallback((payload: CollaborationLimitPayload) => {
      setIsLimitReached(true);
      setCollaborationError(payload.message);
    }, []),
    onError: useCallback((payload: { error: string }) => {
      setCollaborationError(payload.error);
    }, []),
  });

  // 清除错误
  const handleDismissError = useCallback(() => {
    setCollaborationError(null);
    setIsLimitReached(false);
  }, []);

  return (
    <div className="note-editor-container">
      {/* Editor Header */}
      <div className="editor-header">
        {/* Mobile Menu Button - Same as in Notes.tsx */}
        <button
          className="mobile-menu-btn"
          onClick={onMobileMenuClick}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            marginRight: '0.5rem',
            color: 'var(--text-primary)',
            // CSS will handle display: none on desktop
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div className="breadcrumbs">
          <span className="breadcrumb-icon">📄</span>
          <span className="breadcrumb-text">Personal</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{title || 'Untitled'}</span>
        </div>
        <div className="header-actions">
          <div className={`status-indicator ${isSyncing ? 'syncing' : 'saved'}`}>
            <div className="status-dot"></div>
            <span>{isSyncing ? 'Saving' : 'Saved'}</span>
          </div>
          <button className="header-icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </button>
          <button className="header-icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
          </button>
        </div>
      </div>

      <div className="editor-scroll-container">
        <div className="editor-title-section">

          <textarea
            className="editor-title-input"
            placeholder="Untitled"
            value={title}
            onChange={(e) => onTitleChange?.(e.target.value)}
            rows={1}
            spellCheck={false}
          />
        </div>

        {/* 只有当 Y.js 文档初始化完成后，才渲染编辑器 */}
        {isYjsInitialized && ydoc ? (
          <TiptapEditor
            ydoc={ydoc}
            initialContent={initialContent}
            editable={editable}
            isLimitReached={isLimitReached}
            onChange={onChange}
            sendCursorUpdate={sendCursorUpdate}
            presenceUsers={presenceUsers}
            isSyncing={isSyncing}
            noteId={noteId}
          />
        ) : (
          <div className="editor-loading">
            <div className="loading-spinner" />
            <span>初始化协同环境...</span>
          </div>
        )}

        {/* 同步状态指示器 */}
        {isSyncing && (
          <div className="sync-indicator">
            <div className="sync-spinner" />
            <span>同步中...</span>
          </div>
        )}

        {/* 协作限制提示 */}
        {collaborationError && (
          <div className="collaboration-error">
            <span>{collaborationError}</span>
            <button onClick={handleDismissError}>×</button>
          </div>
        )}

        {/* 网络状态栏 */}
        {noteId && (
          <NetworkStatusBar
            connectionState={connectionState}
            onReconnect={reconnect}
          />
        )}

        {/* Y.js 初始化状态调试（仅开发环境） */}
        {import.meta.env.DEV && noteId && (
          <div className="debug-info">
            Y.js: {isYjsInitialized ? '✓' : '×'} |
            Socket: {connectionState.status} |
            Users: {presenceUsers.length}
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteEditor;