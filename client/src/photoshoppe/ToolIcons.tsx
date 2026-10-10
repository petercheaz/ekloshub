import type { ReactNode } from "react";
import type { ToolId } from "./types";

function Svg({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      {children}
    </svg>
  );
}

export function ToolIcon({ tool, size = 20 }: { tool: ToolId; size?: number }) {
  switch (tool) {
    case "move":
      return (
        <Svg size={size}>
          <path d="M10 2l1.2 3.6H15l-3 2.2 1.1 3.5L10 9.8 6.9 11.3 8 7.8 5 5.6h3.8L10 2z" opacity="0.9" />
          <path d="M4 14h12v1.5H4V14zm0 2.5h12V18H4v-1.5z" opacity="0.55" />
        </Svg>
      );
    case "brush":
      return (
        <Svg size={size}>
          <path d="M3 15.5c0-1.2 3.5-4.2 5.8-5.9l1.4 1.4C8.5 12.3 5.5 15.5 5.5 16.5c0 .6.4 1 1 1h.5l3.2-3.2 1.4 1.4-3.5 3.5H6.5c-1.9 0-3.5-1.6-3.5-3.7z" />
          <path d="M12.2 4.8l3 3-1.4 1.4-3-3 1.4-1.4zm1.4-1.4l1.4 1.4-1 1-1.4-1.4 1-1z" />
        </Svg>
      );
    case "eraser":
      return (
        <Svg size={size}>
          <path d="M4 14.5l5.5-5.5 6 6-2.5 2.5H4v-3zm1.5 1.5h6.8L15 12.8 11.2 9 5.7 14.5H5.5z" />
          <path d="M3 16.5h14v1H3v-1z" opacity="0.5" />
        </Svg>
      );
    case "fill":
      return (
        <Svg size={size}>
          <path d="M10 3l-1 1v2.2L5.8 9.4c-.8.8-.8 2 0 2.8l1.8 1.8c.8.8 2 .8 2.8 0L13.8 11V8.8l1-1-4.8-4.8zm-2 9.2l-1.8-1.8 3.2-3.2 1.8 1.8-3.2 3.2z" />
          <path d="M4 16h12v1.5H4V16z" />
        </Svg>
      );
    case "line":
      return (
        <Svg size={size}>
          <path d="M4 15L15 4" stroke="currentColor" strokeWidth="1.75" fill="none" />
          <circle cx="4" cy="15" r="1.25" />
          <circle cx="15" cy="4" r="1.25" />
        </Svg>
      );
    case "rectangle":
      return (
        <Svg size={size}>
          <rect x="4" y="5" width="12" height="10" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </Svg>
      );
    case "ellipse":
      return (
        <Svg size={size}>
          <ellipse cx="10" cy="10" rx="6.5" ry="5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </Svg>
      );
    case "arrow":
      return (
        <Svg size={size}>
          <path d="M4 14l8-8m0 0h-4m4 0v4" stroke="currentColor" strokeWidth="1.75" fill="none" />
        </Svg>
      );
    case "text":
      return (
        <Svg size={size}>
          <path d="M6 4v12M14 4v12M6 4h8M6 10h6" stroke="currentColor" strokeWidth="1.75" fill="none" />
        </Svg>
      );
    default:
      return null;
  }
}
