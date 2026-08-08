import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 768px)';

export function useViewport() {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia(MOBILE_BREAKPOINT).matches;
    });

    useEffect(() => {
        if (!window.matchMedia) return undefined;
        const mq = window.matchMedia(MOBILE_BREAKPOINT);
        const handler = (e) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    return { isMobile };
}
