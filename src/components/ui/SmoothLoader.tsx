import { useState, useEffect, useRef } from 'react';

interface SmoothLoaderProps {
    isLoading: boolean;
    skeleton: React.ReactNode;
    children: React.ReactNode;
    minDuration?: number; // Minimum time to show skeleton in ms
    transitionDuration?: number; // Fade out duration in ms
    className?: string; // Container class
    style?: React.CSSProperties;
}

const SmoothLoader = ({
    isLoading,
    skeleton,
    children,
    minDuration = 1000,
    transitionDuration = 150,
    className = '',
    style,
}: SmoothLoaderProps) => {
    // Phase: 'idle' (showing content) | 'loading' (showing skeleton) | 'fading' (skeleton fade out)
    const [phase, setPhase] = useState<'idle' | 'loading' | 'fading'>(
        isLoading ? 'loading' : 'idle'
    );

    // Track when loading started to enforce minDuration
    const startTimeRef = useRef<number | null>(isLoading ? Date.now() : null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isLoading) {
            // Start Loading
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            startTimeRef.current = Date.now();
            setPhase('loading');
        } else {
            // Stop Loading
            // If we are currently 'idle' (because initial load was false), and isLoading becomes false (stay false), do nothing.
            // But if we were 'loading' or 'fading', we check minDuration.

            // However, if we went from true -> false.
            // Check if we ever started.
            if (startTimeRef.current) {
                const elapsed = Date.now() - startTimeRef.current;
                const remaining = Math.max(0, minDuration - elapsed);

                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    // Use double requestAnimationFrame to ensure the browser has fully painted
                    // the underlying content (which is now updated via props) before we
                    // start fading out the skeleton overlay.
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            setPhase('fading');

                            setTimeout(() => {
                                setPhase('idle');
                                startTimeRef.current = null;
                            }, transitionDuration);
                        });
                    });
                }, remaining);
            } else {
                setPhase('idle');
            }
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isLoading, minDuration, transitionDuration]);

    return (
        <div
            className={`smooth-loader-container ${className}`}
            style={{ position: 'relative', width: '100%', height: '100%', ...style }}
        >
            {/* Real Content: Always rendered, but maybe hidden or underneath? 
                Actually nice to render it so it's ready.
                If phase is 'idle', opacity 1. 
                If phase is 'loading', opacity 0 (or hidden).
                If phase is 'fading', opacity 0 -> 1? 
                
                Strategy: Cross-fade.
                Skeleton is absolute on top? Or content is replaced?
                If we use absolute positioning, layout might jump.
                Better to conditionally render if we can match dimensions, but skeletons usually hardcoded size.
                
                Let's stick to standard replacement for lists.
                Content opacity 0 when loading.
             */}

            <div
                className="content-wrapper"
                style={{
                    // [OPTIMIZATION] Always keep content visible (opacity 1) but underneath the skeleton.
                    // The skeleton wrapper has an opaque background (bg-primary) so it covers the content.
                    // when skeleton fades out, content is revealed instantly without any white gap.
                    opacity: 1,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {children}
            </div>

            {(phase === 'loading' || phase === 'fading') && (
                <div
                    className="skeleton-wrapper"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        opacity: phase === 'fading' ? 0 : 1,
                        transition: `opacity ${transitionDuration}ms ease-out`,
                        zIndex: 10,
                        backgroundColor: 'var(--bg-primary)', // Ensure background covers content
                        pointerEvents: 'none', // Allow clicks pass through if fading? No, usually block.
                    }}
                >
                    {skeleton}
                </div>
            )}
        </div>
    );
};

export default SmoothLoader;
