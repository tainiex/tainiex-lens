import { useState, useEffect, useRef } from 'react';

type AnimationState = 'loading' | 'finishing' | 'hidden';

export function useLoadingAnimation(isLoading: boolean) {
    const [animationState, setAnimationState] = useState<AnimationState>('hidden');
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isLoading) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setAnimationState('loading');
        } else {
            // Only transition to finishing if we were loading
            setAnimationState(prev => {
                if (prev === 'loading') {
                    // Start finishing animation
                    timeoutRef.current = setTimeout(() => {
                        setAnimationState('hidden');
                    }, 400); // 400ms match CSS animation duration
                    return 'finishing';
                }
                return 'hidden';
            });
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isLoading]);

    return animationState;
}
