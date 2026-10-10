export type ToolId =
  | "move"
  | "brush"
  | "eraser"
  | "line"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "text"
  | "fill";

export type BrushStyle = "round" | "square" | "marker" | "pencil" | "airbrush" | "calligraphy";

export type LayerModel = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  locked: boolean;
};

export type DocSize = { width: number; height: number };

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: CanvasTextAlign;
};

export type EditorSnapshot = {
  layers: LayerModel[];
  pixels: Record<string, string>;
  doc: DocSize;
  activeLayerId: string | null;
};

export const FONT_FAMILIES = [
  "Inter, system-ui, sans-serif",
  "Georgia, serif",
  "Times New Roman, serif",
  "Courier New, monospace",
  "Comic Sans MS, cursive",
  "Impact, sans-serif",
  "Arial Black, sans-serif",
];

export const BRUSH_STYLES: { id: BrushStyle; label: string }[] = [
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
  { id: "marker", label: "Marker" },
  { id: "pencil", label: "Pencil" },
  { id: "airbrush", label: "Airbrush" },
  { id: "calligraphy", label: "Calligraphy" },
];

export const DEFAULT_DOC: DocSize = { width: 1280, height: 720 };
