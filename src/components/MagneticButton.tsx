import { useMemo, useRef, type ButtonHTMLAttributes } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

// motion.button defines its own (gesture-flavored) onDrag*/onAnimation*
// handlers, which collide with the native DOM ones on ButtonHTMLAttributes —
// omit them since this component doesn't use either.
type NativeProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

interface Props extends NativeProps {
  strength?: number;
}

/** A button that leans slightly toward the cursor within its own bounds —
 * respects prefers-reduced-motion (becomes a plain, static button). */
export function MagneticButton({ strength = 0.3, style, ...rest }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    []
  );

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 16, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 200, damping: 16, mass: 0.4 });

  function handleMove(e: React.MouseEvent<HTMLButtonElement>) {
    if (reduce) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
  }
  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.button
      ref={ref}
      style={{ ...style, x: springX, y: springY }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      {...rest}
    />
  );
}
