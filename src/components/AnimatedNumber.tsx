import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

// Tweens between values so a tick reads as motion instead of a jump.
export function AnimatedNumber({ value, format, duration = 0.9 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { from.current = v; setShown(v); },
    });
    return () => controls.stop();
  }, [value, duration]);

  return <>{format(shown)}</>;
}
