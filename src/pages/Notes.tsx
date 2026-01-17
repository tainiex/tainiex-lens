import { useState, useEffect, useRef } from 'react';
import { useParams, useOutletContext, useLocation } from 'react-router-dom';
import NoteEditor from '../components/NoteEditor';
import PageHeader from '../components/PageHeader';
import { AppLayoutContextType } from '../layouts/AppLayout';
import './AppDashboard.css';
import { INote, apiClient, logger } from '@/shared';

const Notes = () => {
    const params = useParams();
    const noteId = params['*'] || params.noteId;

    // Consume data from Layout
    const {
        setIsSidebarOpen,
        notes,
        handleUpdateNoteTitle, // Consuming the new handler
        user,
        isLoadingNotes, // Now available in context
    } = useOutletContext<AppLayoutContextType>();

    // Local state for fetched note (deep linking support)
    const [fetchedNote, setFetchedNote] = useState<INote | null>(null);
    const [isFetchingNote, setIsFetchingNote] = useState(false);

    const activeNote = notes.find(n => n.id === noteId);
    const finalNote = activeNote || fetchedNote;

    // Use fetchedNote if activeNote is missing, but prefer activeNote (live updates from sidebar)
    // Actually, if activeNote exists, we should probably clear fetchedNote to avoid confusion,
    // OR just use 'finalNote' derived.

    // Effect: Fetch note if noteId exists but not found in 'notes' (roots/cache)
    useEffect(() => {
        if (noteId && !activeNote && !isFetchingNote && !fetchedNote) {
            // Guard: If we already failed or are fetching, don't loop.
            // But if user switches noteId, we need to reset.
            // So we depend on [noteId].
        }
    }, [noteId, activeNote]);

    useEffect(() => {
        // Reset fetched state when ID changes
        setFetchedNote(null);
        setIsFetchingNote(false);
    }, [noteId]);

    useEffect(() => {
        if (noteId && !activeNote && !fetchedNote) {
            setIsFetchingNote(true);
            apiClient
                .get(`/api/notes/${noteId}`)
                .then(async res => {
                    if (res.ok) {
                        const data = await res.json();
                        // [FIX] Sanitize title to allow gray placeholder to show
                        if (data.title === 'Untitled' || data.title === 'Untitled Note') {
                            data.title = '';
                        }
                        setFetchedNote(data);
                    } else {
                        // 404 or error
                    }
                })
                .catch(err => logger.error('[Notes] Failed to fetch note:', err))
                .finally(() => setIsFetchingNote(false));
        }
    }, [noteId, activeNote, fetchedNote]);

    // Local state for title to support smooth typing and debounced updates
    const [localTitle, setLocalTitle] = useState<string>('');
    const titleUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Sync local title when active note changes or loads
    useEffect(() => {
        if (finalNote) {
            // [FIX] Double check title is not 'Untitled' locally too
            let t = finalNote.title || '';
            if (t === 'Untitled' || t === 'Untitled Note') t = '';
            setLocalTitle(t);
        }
    }, [finalNote?.id, finalNote?.title]); // Update if ID changes or remote title updates

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

    // [FIX] 404 Detection
    const shouldShowEditor = !!finalNote;
    const isNoteLoading = (isLoadingNotes || isFetchingNote) && !finalNote;
    const isNotFound = !isLoadingNotes && !isFetchingNote && !finalNote && !!noteId;

    const location = useLocation();
    const hideSidebar = new URLSearchParams(location.search).get('hideSidebar');

    return (
        <div
            className="notes-view-container"
            style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
        >
            {/* Mobile Header for Navigation - Show when no note is selected OR if note is successfully loaded (editor handles its own header, but we might want consistent mobile nav?) */}
            {/* Actually, NoteEditor has its own mobile header button. We only show this placeholder header when NO note is selected. */}
            {/* But if 404, we also want a way to open sidebar? */}
            {(!noteId || isNotFound) && !hideSidebar && (
                <PageHeader
                    startContent={
                        <button
                            className="header-icon-btn mobile-menu-btn"
                            onClick={() => setIsSidebarOpen(true)}
                        >
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="3" y1="12" x2="21" y2="12"></line>
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>
                    }
                    centerContent={<span style={{ fontWeight: 600, fontSize: '1rem' }}>Notes</span>}
                />
            )}

            <div style={{ flex: 1, padding: 0, overflowY: 'hidden' }}>
                {shouldShowEditor ? (
                    <NoteEditor
                        key={noteId} // [FIX] Re-added to ensure clean unmount/remount when switching notes
                        noteId={noteId!} // asserted
                        title={localTitle}
                        onTitleChange={handleTitleChange}
                        onMobileMenuClick={hideSidebar ? undefined : () => setIsSidebarOpen(true)}
                        isLoading={false} // Data is ready
                        user={user}
                    />
                ) : isNoteLoading ? (
                    // Show Loading Skeleton via NoteEditor with isLoading=true
                    // We pass a dummy NoteEditor to reuse its skeleton?
                    // Or just render NoteEditor with isLoading=true and null noteId?
                    // NoteEditor requires noteId... let's pass the requested ID but set isLoading.
                    <NoteEditor
                        key={noteId}
                        noteId={noteId!}
                        title=""
                        isLoading={true} // Show skeleton
                        user={user}
                        onMobileMenuClick={hideSidebar ? undefined : () => setIsSidebarOpen(true)}
                    />
                ) : isNotFound ? (
                    // 404 UI
                    <div
                        style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-tertiary)',
                            gap: '1rem',
                        }}
                    >
                        <svg
                            width="64"
                            height="64"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--text-quaternary)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                        <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                            Note not found
                        </h3>
                        <p>The note you are looking for does not exist or has been deleted.</p>
                    </div>
                ) : (
                    // No Note Selected (Root /app/notes)
                    <div
                        style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-tertiary)',
                            gap: '1rem',
                        }}
                    >
                        <svg
                            width="64"
                            height="64"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--text-quaternary)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <p>Select a note to view or create a new one</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notes;
