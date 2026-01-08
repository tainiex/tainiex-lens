/**
 * 协同笔记编辑器组件
 * Collaborative Note Editor Component
 * 
 * 基于 Tiptap + Y.js 的实时协同编辑器
 */

import { useEditor, EditorContent } from '@tiptap/react';
import UniqueID from '@tiptap/extension-unique-id';

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
import { useEffect, useCallback, useState, useRef } from 'react';
import * as Y from 'yjs';
import { useCollaborationSocket } from '../hooks/useCollaborationSocket';
import { useYjsDocument } from '../hooks/useYjsDocument';
// import NetworkStatusBar from './NetworkStatusBar';
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
  fragment,
  initialContent,
  editable,
  isLimitReached,
  onChange,
  sendCursorUpdate,
  // presenceUsers,
  isSyncing,
  noteId,
}: {
  ydoc: Y.Doc;
  fragment: Y.XmlFragment;
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
      UniqueID.configure({
        types: ['heading', 'paragraph', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock'],
      }),
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
        fragment: fragment, // [FIX] Use dynamic fragment passed from hook
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

  // [DEBUG] Trace Mount/Unmount
  useEffect(() => {
    console.log(`[DEBUG_TRACE] [UI] TiptapEditor MOUNTED. Key/Fragment: ${noteId} / ${fragment?.doc ? 'Valid Fragment' : 'Invalid Fragment'}`);
    return () => {
      console.log('[DEBUG_TRACE] [UI] TiptapEditor UNMOUNTED.');
    };
  }, [noteId, fragment]);

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

  // [FIX] Circular Dependency: Use a Ref to allow accessing sendUpdate from useYjsDocument
  const sendUpdateRef = useRef<((update: string, targetNoteId: string) => void) | null>(null);

  // Y.js 文档管理
  const {
    ydoc,
    yXmlFragment,
    activeFragmentName, // [FIX] Get fragment name for key
    isInitialized: isYjsInitialized,
    isSyncing,
    applyRemoteUpdate,
    applyInitialSync,
  } = useYjsDocument({
    noteId,
    onLocalUpdate: (update) => {
      logger.debug('[NoteEditor] Sending local update, size:', update.length);
      if (noteId && sendUpdateRef.current) {
        sendUpdateRef.current(update, noteId);
      }
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
      setCollaborationError(payload.error);
    }, []),
    onError: useCallback((payload: { error: string }) => {
      setCollaborationError(payload.error);
    }, []),
  });

  // [FIX] Keep Ref updated with the latest sendUpdate function
  useEffect(() => {
    sendUpdateRef.current = sendUpdate;
  }, [sendUpdate]);

  // Determine Connection traffic light status
  let connectionStatusClass = 'connected';
  const { status, error: wsError } = connectionState;

  if (status === 'connecting' || status === 'reconnecting') {
    connectionStatusClass = 'connecting';
  } else if (status === 'disconnected' || wsError) {
    connectionStatusClass = 'failed';
  }

  // [DEBUG] Trace Render
  console.log(`[DEBUG_TRACE] [UI] NoteEditor Render. NoteId: ${noteId}, ActiveFragment: ${activeFragmentName}`);

  // 监听 noteId 变化，重置 socket 状态
  useEffect(() => {
    if (noteId) {
      setCollaborationError(null);
      setIsLimitReached(false);
    }
  }, [noteId]);

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
            <span>{isSyncing ? 'Saving...' : 'Saved'}</span>
          </div>

          {/* Traffic Light Connection Status */}
          <div
            className="connection-status-light"
            title={status === 'connected' ? 'Connected' : 'Click to reconnect'}
            onClick={() => status !== 'connected' && reconnect()}
          >
            <div className={`connection-dot ${connectionStatusClass}`}></div>
          </div>

          <button className="header-icon-btn" title="Export">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </button>

          {/* Removed the second star/favorite icon as requested */}
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
            key={`${noteId}-${activeFragmentName}`} // [FIX] Force remount when fragment changes
            ydoc={ydoc}
            fragment={yXmlFragment || ydoc.getXmlFragment('blocks')} // [FIX] Pass dynamic fragment (blocks or default)
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

        {/* 同步状态指示器 - Optional to keep, header already has status */}
        {/* {isSyncing && (
          <div className="sync-indicator">
            <div className="sync-spinner" />
            <span>同步中...</span>
          </div>
        )} */}
        {/* User asked to remove prompt/toasts, but this is a subtle indicator at bottom right. 
            The requirement said "Remove connection tips, use green/yellow light". 
            I'll interpret that as removing the NetworkStatusBar mostly. 
            I'll comment out the bottom sync indicator too since we have it in the header now. 
        */}

        {/* 协作限制提示 */}
        {collaborationError && (
          <div className="collaboration-error">
            <span>{collaborationError}</span>
            <button onClick={handleDismissError}>×</button>
          </div>
        )}

        {/* Removed NetworkStatusBar as requested */}

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