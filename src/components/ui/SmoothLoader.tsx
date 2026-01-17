import { useEffect, useRef, useState } from 'react';
import { logger } from '@/shared/utils/logger';

interface SmoothLoaderProps {
    isLoading: boolean;
    skeleton: React.ReactNode;
    children: React.ReactNode;
    minDuration?: number; // Minimum time to show skeleton in ms
    transitionDuration?: number; // Not used in new implementation
    className?: string;
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
    // We rely on the parent to provide a correct, stable `isLoading` gate (e.g. `shouldShowSkeleton`).
    // This component only enforces a minimum visible duration BEFORE allowing skeleton to hide.
    //
    // IMPORTANT: the "hold" needs to be state (not ref), otherwise React won't re-render when the
    // min-duration timer completes, which can cause missing skeleton or text flashes.
    const startTimeRef = useRef<number | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [canHide, setCanHide] = useState(true);

    useEffect(() => {
        // Keep transitionDuration param for backward compatibility (currently unused)
        void transitionDuration;

        logger.debug('[SkeletonDebug][SmoothLoader][effect:start]', {
            isLoading,
            canHide,
            minDuration,
            hasStartTime: !!startTimeRef.current,
            ts: performance.now(),
        });

        if (isLoading) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            startTimeRef.current = Date.now();
            setCanHide(false);

            logger.debug('[SkeletonDebug][SmoothLoader][loading:start]', {
                startTime: startTimeRef.current,
                ts: performance.now(),
            });

            return () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            };
        }

        // If loading ends, enforce minDuration by blocking hide until time passes.
        if (startTimeRef.current) {
            const elapsed = Date.now() - startTimeRef.current;
            const remaining = Math.max(0, minDuration - elapsed);

            logger.debug('[SkeletonDebug][SmoothLoader][loading:stop-request]', {
                elapsed,
                remaining,
                minDuration,
                ts: performance.now(),
            });

            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                logger.debug('[SkeletonDebug][SmoothLoader][minDuration:met]', {
                    elapsed: Date.now() - (startTimeRef.current || Date.now()),
                    ts: performance.now(),
                });

                startTimeRef.current = null;
                setCanHide(true);
            }, remaining);
        } else {
            // No known start time -> allow hide immediately
            setCanHide(true);
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isLoading, minDuration, transitionDuration, canHide]);

    // External gate decides visibility; we keep skeleton visible while we cannot hide yet.
    const shouldRenderSkeleton = isLoading || !canHide;

    return (
        <div
            className={`smooth-loader-container ${className}`}
            style={{ position: 'relative', width: '100%', height: '100%', ...style }}
        >
            <div
                className="content-wrapper"
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'var(--bg-primary)',
                }}
            >
                {children}
            </div>

            {shouldRenderSkeleton && (
                <div
                    className="skeleton-wrapper"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 10,
                        backgroundColor: 'var(--bg-primary)',
                    }}
                >
                    {skeleton}
                </div>
            )}
        </div>
    );
};

export default SmoothLoader;
