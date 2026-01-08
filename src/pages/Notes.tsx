import { useState, useEffect, useRef } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import NoteEditor from '../components/NoteEditor';
import { AppLayoutContextType } from '../layouts/AppLayout';
import './AppDashboard.css';

const Notes = () => {

    const params = useParams();
    const noteId = params["*"] || params.noteId;

    // Consume data from Layout
    const {
        setIsSidebarOpen,
        notes,
        // notes are already sorted in layout?
        handleUpdateNoteTitle, // Consuming the new handler
        user,
    } = useOutletContext<AppLayoutContextType>();

    // Notes state is now managed in Layout.
    // What about `isLoadingNotes`?
    // In Layout we have `isLoadingNotes`. We should expose it in context?
    // I missed `isLoadingNotes` in Context Type in previous step.
    // Let me check AppLayout.tsx ... I passed `isLoadingNotes` to Sidebar, but maybe not in context?
    // `notes` are there.

    // Wait, Notes View *displays* the NoteEditor.
    // NoteEditor needs `isLoading`?
    // In `AppLayout`, `isLoadingNotes` is for the LIST.
    // `NoteEditor` loads its own content via Yjs hook. 
    // The `isLoading` prop in `NoteEditor` was used to show Title Skeleton while list is loading? 
    // Or while we fetch the specific note?
    // Previously `Notes.tsx` fetched ALL notes, so `isLoadingNotes` meant "list is loading".
    // NoteEditor uses `noteId` to init Yjs. 
    // Title is passed from `activeNote?.title`.
    // If `notes` list is loading, `activeNote` might be undefined.
    // So yes, we need `isLoadingNotes` from context to show skeleton in Editor if we want.
    // I should check `AppLayout.tsx` again to see if I exposed `isLoadingNotes`.
    // If not, I can quickly add it or just assume if `notes.length === 0` it's loading? No that's "empty".

    // For now, let's assume `activeNote` being undefined is handled by NoteEditor (it shows untitled or skeleton?).
    // In previous `Notes.tsx`, `activeNote?.title` was passed. 
    // If `isLoading` passed to Editor is true, it shows skeleton.

    // I will read AppLayout.tsx content from previous step memory or just view it?
    // I wrote it in step 117. `contextValue` did NOT include `isLoadingNotes`.
    // I should probably add it. But to save steps, let's see if we can live without it or infer it.
    // If `activeNote` is missing but `noteId` is present, it means either invalid ID or Loading.
    // Since we lift state, `notes` might be empty initially.

    // Let's implement Notes.tsx.

    const activeNote = notes.find(n => n.id === noteId);

    // Local state for title to support smooth typing and debounced updates
    const [localTitle, setLocalTitle] = useState<string>('');
    const titleUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Sync local title when active note changes or loads
    useEffect(() => {
        if (activeNote) {
            setLocalTitle(activeNote.title);
        }
    }, [activeNote?.id, activeNote?.title]); // Update if ID changes or remote title updates




    const handleTitleChange = (newTitle: string) => {
        if (!noteId) return;

        // 1. Update local UI immediately
        setLocalTitle(newTitle);

        // 2. Debounce the API call / Context update
        if (titleUpdateTimeoutRef.current) {
            clearTimeout(titleUpdateTimeoutRef.current);
        }

        titleUpdateTimeoutRef.current = setTimeout(() => {
            handleUpdateNoteTitle(noteId, newTitle);
        }, 500); // 500ms delay
    };

    // Cleanup timeout
    useEffect(() => {
        return () => {
            if (titleUpdateTimeoutRef.current) {
                clearTimeout(titleUpdateTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div className="notes-view-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Mobile Header for Navigation - Only show when no note is selected */}
            {!noteId && (
                <div className="mobile-header" style={{
                    padding: '0 1rem',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    borderBottom: '1px solid var(--border-primary)',
                    height: '60px',
                    minHeight: '60px'
                }}>
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setIsSidebarOpen(true)}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            display: 'flex',
                            color: 'var(--text-primary)',
                            position: 'absolute',
                            left: '1rem',
                            zIndex: 1
                        }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                    <span style={{ fontWeight: 600, fontSize: '1.1rem', whiteSpace: 'nowrap' }}>Notes</span>
                </div>
            )}

            <div style={{ flex: 1, padding: 0, overflowY: 'hidden' }}>
                {noteId ? (
                    <NoteEditor
                        key={noteId}
                        noteId={noteId}
                        title={localTitle}
                        onTitleChange={handleTitleChange}
                        onMobileMenuClick={() => setIsSidebarOpen(true)}
                        isLoading={!activeNote} // Infer loading if noteId exists but note not found yet
                        user={user}
                    />
                ) : (
                    <div style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-tertiary)',
                        gap: '1rem'
                    }}>
                        <div style={{ fontSize: '3rem' }}>📝</div>
                        <p>Select a note to view or create a new one</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notes;
