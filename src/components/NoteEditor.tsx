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
import React, { useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
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

import { IUser } from '@tainiex/tainiex-shared';

interface NoteEditorProps {
  noteId: string | null;
  title?: string;
  initialContent?: string;
  onChange?: (content: string) => void;
  onTitleChange?: (title: string) => void;
  user: IUser | null;
  editable?: boolean;
  onMobileMenuClick?: () => void;
  isLoading?: boolean;
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
  onReady,
  hasData,
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
  onReady?: () => void;
  hasData: boolean;
  isLoading?: boolean;
}) => {
  const [isReadyCalled, setIsReadyCalled] = useState(false);

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
        placeholder: 'Start writing your note...',
      }),
      Collaboration.configure({
        document: ydoc,
        fragment: fragment, // [FIX] Use dynamic fragment passed from hook
      }),
    ],
    content: initialContent,
    editable: editable && !isLimitReached,
    onCreate: ({ editor }) => {
      // [FIX] Smart Loading Strategy:
      // 1. If hasData is false (New Note), show immediately.
      // 2. If hasData is true (Existing Note), wait for content to render.
      if (!hasData || !editor.isEmpty) {
        // Defer to avoid "Cannot update component while rendering"
        setTimeout(() => {
          onReady?.();
          setIsReadyCalled(true);
        }, 0);
      }
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());

      // If we were waiting for data, and now we have it (or editor updated), show it.
      if (!isReadyCalled) {
        setTimeout(() => {
          onReady?.();
          setIsReadyCalled(true);
        }, 0);
      }
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

  // [FIX] Safety Timeout: If for some reason Tiptap doesn't update (e.g. data is just whitespace), force show after 500ms
  useEffect(() => {
    if (!isReadyCalled) {
      const timer = setTimeout(() => {

        onReady?.();
        setIsReadyCalled(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReadyCalled, onReady]);



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

const NoteEditor = React.memo(({
  noteId,
  title = '',
  initialContent,
  onChange,
  onTitleChange,
  user,
  editable = true,
  onMobileMenuClick,
  isLoading,
}: NoteEditorProps) => {
  const [collaborationError, setCollaborationError] = useState<string | null>(null);
  const [isLimitReached, setIsLimitReached] = useState(false);



  // [FIX] Circular Dependency: Use a Ref to allow accessing sendUpdate from useYjsDocument
  const sendUpdateRef = useRef<((update: string, targetNoteId: string) => void) | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // [UI] Auto-expand Title Textarea
  useLayoutEffect(() => {
    if (titleRef.current) {
      // Reset height to get correct scrollHeight
      titleRef.current.style.height = 'auto';
      // Set height based on content
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
  }, [title]);

  // Y.js 文档管理
  const {
    ydoc,
    yXmlFragment,
    activeFragmentName, // [FIX] Get fragment name for key
    isInitialized: isYjsInitialized,
    isSyncing,
    hasData,
    applyRemoteUpdate,
    applyInitialSync,
  } = useYjsDocument({
    noteId,
    onLocalUpdate: (update) => {
      logger.debug('[NoteEditor] Sending local update, size:', update.length);

      // [FIX] Status Tracking: Mark as saving
      lastUpdateTimeRef.current = Date.now();
      if (connectionState.status === 'connected') {
        setSaveStatus('saving');

        // Clear any pending 'saved' switch
        if (savingTimeoutRef.current) {
          clearTimeout(savingTimeoutRef.current);
          savingTimeoutRef.current = null;
        }
      } else {
        setSaveStatus('offline');
      }

      if (noteId && sendUpdateRef.current) {
        sendUpdateRef.current(update, noteId);

        // [FIX] Status Tracking: Mark as sent to transport
        lastSentTimeRef.current = Date.now();

        // [FIX] Debounce "Saved" state
        if (connectionState.status === 'connected') {
          savingTimeoutRef.current = setTimeout(() => {
            // Only switch to saved if we haven't typed since
            if (lastSentTimeRef.current >= lastUpdateTimeRef.current) {
              setSaveStatus('saved');
            }
          }, 800);
        }
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
    isSynced: isSocketSynced, // Rename to avoid conflict if needed
  } = useCollaborationSocket({
    noteId,
    user, // Pass user here
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

  // Auto-resize title textarea to fit content
  useEffect(() => {
    if (titleRef.current) {
      // Reset height to 0 to force scrollHeight recalculation
      titleRef.current.style.height = '0px';
      // Force a reflow by reading offsetHeight
      void titleRef.current.offsetHeight;
      // Now set height to match actual content
      const newHeight = titleRef.current.scrollHeight;
      titleRef.current.style.height = newHeight + 'px';
    }
  }, [title]);

  // Determine Network Status Light Class
  let networkStatusClass = 'connected';
  const { status } = connectionState;

  if (status === 'connecting' || status === 'reconnecting') {
    networkStatusClass = 'connecting';
  } else if (status === 'disconnected') {
    networkStatusClass = 'disconnected';
  }

  // [FIX] Real-time Saving Status Logic
  // 1. Offline Priority
  // 2. Saving (Unsent changes)
  // 3. Saved (All clear)

  // Track timestamps to determine if we have unsent changes
  // We use refs to avoid re-renders during rapid typing, but trigger re-render on status change
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
  const lastUpdateTimeRef = useRef<number>(0);
  const lastSentTimeRef = useRef<number>(0);
  const savingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync effect to update status based on connection and timestamps
  useEffect(() => {
    // If disconnected, force offline status
    if (status !== 'connected') {
      setSaveStatus('offline');
      return;
    }

    // [FIX] Connection restored!
    // Check if we have pending unsaved changes.
    // If lastSentTime >= lastUpdateTime, we are effectively saved.
    // Otherwise, we are still saving (waiting for emit).
    if (lastSentTimeRef.current >= lastUpdateTimeRef.current) {
      setSaveStatus('saved');
    } else {
      setSaveStatus('saving');
    }
  }, [status]);

  // 清除错误
  const handleDismissError = useCallback(() => {
    setCollaborationError(null);
    setIsLimitReached(false);
  }, []);

  // [FIX] Editor ready state to prevent placeholder flash
  const [isEditorReady, setIsEditorReady] = useState(false);

  // [FIX] Reset ready state when note changes
  useEffect(() => {
    setIsEditorReady(false);
  }, [noteId]);

  // Update logic when Data is Sent (Emitted)
  // We need to hook into the socket send. 
  // Since `useCollaborationSocket` owns `sendUpdate`, we can wrap it or listen to it?
  // We passed `onLocalUpdate` to `useYjsDocument`, which calls `sendUpdate`.
  // Let's wrap the `onLocalUpdate` passed to `useYjsDocument`!

  // In `useYjsDocument` props below:
  /*
    onLocalUpdate: (update) => {
        handleLocalUpdate(); // Mark as dirty/saving
        if (noteId && sendUpdateRef.current) {
            sendUpdateRef.current(update, noteId);
            // Mark as sent immediately after handing to socket?
            // Yes, "Sent to Transport".
            lastSentTimeRef.current = Date.now();
            
            // Debounce the switch back to "Saved" to avoid flickering
            if (savingTimeoutRef.current) clearTimeout(savingTimeoutRef.current);
            savingTimeoutRef.current = setTimeout(() => {
                if (lastSentTimeRef.current >= lastUpdateTimeRef.current) {
                    setSaveStatus('saved');
                }
            }, 800); // 800ms natural pause
        }
    }
  */

  // Status Text
  const statusText = saveStatus === 'saved' ? 'Saved' : (saveStatus === 'saving' ? 'Saving...' : 'Offline');

  return (
    <div className="note-editor-container">
      {/* Mobile Menu Button - Positioned in the header */}
      {/* If isLoading, we might want to hide it or show simplified header */}
      <div className="editor-header">
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
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div className="breadcrumbs">
          <span className="breadcrumb-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </span>
          <span className="breadcrumb-text">Private</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{title || 'Untitled'}</span>
        </div>
        <div className="header-actions">
          {/* New Status Indicator */}
          <div className={`status-indicator ${saveStatus === 'saving' || isSyncing ? 'syncing' : saveStatus === 'offline' ? 'offline' : 'saved'}`}>
            {saveStatus !== 'offline' && <div className="status-dot"></div>}
            <span>{statusText}</span>
          </div>

          {/* Network Status Light */}
          <div
            className="network-status-indicator"
            title={status === 'connected' ? 'Connected' : 'Click to reconnect'}
            onClick={() => status !== 'connected' && reconnect()}
          >
            <div className={`connection-dot ${networkStatusClass}`}></div>
          </div>
        </div>
      </div>

      <div className="editor-scroll-container">
        <div className="editor-title-section">

          {(isLoading || title === undefined || title === null) ? (
            <div className="editor-title-skeleton" style={{
              height: '38px',
              width: '50%',
              backgroundColor: 'rgba(0,0,0,0.03)', // [FIX] Lighter skeleton
              borderRadius: '4px',
              animation: 'pulse 1.5s infinite'
            }} />
          ) : (
            <textarea
              ref={titleRef}
              className="editor-title-input"
              placeholder="Untitled"
              value={title}
              onChange={(e) => {
                onTitleChange?.(e.target.value);
                // [FIX] Show saving status for title updates
                setSaveStatus('saving');
                // Debounce the switch back to "Saved" (matching parent's debounce ~500ms + network)
                if (savingTimeoutRef.current) clearTimeout(savingTimeoutRef.current);
                savingTimeoutRef.current = setTimeout(() => {
                  setSaveStatus('saved');
                }, 1200);
              }}
              spellCheck={false}
            />
          )}
        </div>

        {/* 只有当 Y.js 文档初始化完成 且 (有数据 或 已完成同步确认是空文档) 时，才渲染编辑器 */}
        {(() => {
          // [FIX] Strict Loading Strategy:
          // Show Editor ONLY if:
          // 1. We have local data (hasData == true)
          // 2. OR we have finished syncing and verified it is empty (isSocketSynced == true)
          // This prevents the "Flash of Default Content" on existing notes.
          const readyToMount = isYjsInitialized && ydoc && (hasData || isSocketSynced);
          return readyToMount;
        })() ? (
          <>
            {!isEditorReady && (
              <div className="editor-content-shell" style={{
                width: '100%',
                maxWidth: '850px',
                margin: '0 auto',
                padding: '0 3rem',
                paddingTop: '3rem', // Match editor-title-section vertical alignment
                display: 'flex',
                flexDirection: 'column',
              }}>
                {/* [FIX] Unify skeleton style with initial load state */}
                <div style={{ height: '20px', width: '100%', backgroundColor: 'rgba(0,0,0,0.03)', marginBottom: '0.8rem', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ height: '20px', width: '92%', backgroundColor: 'rgba(0,0,0,0.03)', marginBottom: '0.8rem', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ height: '20px', width: '96%', backgroundColor: 'rgba(0,0,0,0.03)', marginBottom: '0.8rem', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ height: '20px', width: '80%', backgroundColor: 'rgba(0,0,0,0.03)', marginBottom: '0.8rem', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              </div>
            )}
            <div style={{ display: isEditorReady ? 'block' : 'none' }}>
              <TiptapEditor
                key={`${noteId}-${activeFragmentName}`} // [FIX] Force remount when fragment changes
                ydoc={ydoc!}
                fragment={yXmlFragment || ydoc!.getXmlFragment('blocks')} // [FIX] Pass dynamic fragment
                initialContent={hasData ? '' : (initialContent || '')} // [FIX] Prevent Tiptap from merging initialContent if Yjs has data
                editable={editable}
                isLimitReached={isLimitReached}
                onChange={onChange}
                sendCursorUpdate={sendCursorUpdate}
                presenceUsers={presenceUsers}
                isSyncing={isSyncing}
                noteId={noteId}
                onReady={() => setIsEditorReady(true)}
                hasData={hasData} // Tiptap will use this to decide if it needs to wait for render
              />
            </div>
          </>
        ) : (
          // [FIX] Show Skeleton during initial Sync/Load instead of Spinner or "Initializing..." text
          // This fixes the "Gray Bar" glitch by making the loading state look like the editor
          <div className="editor-content-shell" style={{
            width: '100%',
            maxWidth: '850px',
            margin: '0 auto',
            padding: '0 3rem',
            paddingTop: '3rem', // Match editor-title-section vertical alignment
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* [FIX] Removed duplicate title block to prevent layout shift */}
            <div style={{ height: '20px', width: '100%', backgroundColor: 'rgba(0,0,0,0.03)', marginBottom: '0.8rem', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ height: '20px', width: '92%', backgroundColor: 'rgba(0,0,0,0.03)', marginBottom: '0.8rem', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ height: '20px', width: '96%', backgroundColor: 'rgba(0,0,0,0.03)', marginBottom: '0.8rem', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ height: '20px', width: '80%', backgroundColor: 'rgba(0,0,0,0.03)', marginBottom: '0.8rem', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
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
});

export default NoteEditor;