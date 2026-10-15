import { useCallback, useEffect, useRef, type ReactNode } from "react";

type Props = {
  /** Full string shown in the native tooltip when truncated (or always if force). */
  text: string;
  /** Show tooltip even when the label is not visually clipped (e.g. compact first name). */
  force?: boolean;
  className?: string;
  children: ReactNode;
};

function isClipped(el: HTMLElement) {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}

export function TruncationTooltip({ text, force = false, className, children }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  const syncTitle = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (force) {
      el.title = text;
      return;
    }
    const inner = el.querySelectorAll<HTMLElement>(
      ".vbs-reg-class-chip-name, .vbs-reg-class-chip-name-text, .vbs-reg-class-chip-login, .vbs-reg-class-chip-login-text, .vbs-student-name-text",
    );
    const clipped =
      isClipped(el) || Array.from(inner).some((node) => isClipped(node));
    el.title = clipped ? text : "";
  }, [text, force]);

  useEffect(() => {
    if (force) {
      syncTitle();
    }
  }, [force, syncTitle, text]);

  const rootClass = className ? `vbs-truncation-tooltip ${className}` : "vbs-truncation-tooltip";

  return (
    <span
      ref={ref}
      className={rootClass}
      onMouseEnter={syncTitle}
      onFocus={syncTitle}
    >
      {children}
    </span>
  );
}
