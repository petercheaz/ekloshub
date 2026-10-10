import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  applyBrushContext,
  drawShapePreview,
  drawTextOnCanvas,
  floodFill,
  strokePoint,
} from "./draw";
import { ToolIcon } from "./ToolIcons";
import {
  BRUSH_STYLES,
  DEFAULT_DOC,
  FONT_FAMILIES,
  type BrushStyle,
  type DocSize,
  type EditorSnapshot,
  type LayerModel,
  type TextStyle,
  type ToolId,
} from "./types";

function uid() {
  return crypto.randomUUID();
}

function createLayerCanvas(doc: DocSize) {
  const canvas = document.createElement("canvas");
  canvas.width = doc.width;
  canvas.height = doc.height;
  return canvas;
}

function snapshotFrom(
  layers: LayerModel[],
  canvases: Map<string, HTMLCanvasElement>,
  doc: DocSize,
  activeLayerId: string | null,
): EditorSnapshot {
  const pixels: Record<string, string> = {};
  for (const layer of layers) {
    const canvas = canvases.get(layer.id);
    if (canvas) {
      pixels[layer.id] = canvas.toDataURL("image/png");
    }
  }
  return {
    layers: layers.map((l) => ({ ...l })),
    pixels,
    doc: { ...doc },
    activeLayerId,
  };
}

async function restoreSnapshot(snapshot: EditorSnapshot) {
  const canvases = new Map<string, HTMLCanvasElement>();
  await Promise.all(
    snapshot.layers.map(
      (layer) =>
        new Promise<void>((resolve) => {
          const canvas = createLayerCanvas(snapshot.doc);
          const ctx = canvas.getContext("2d");
          const data = snapshot.pixels[layer.id];
          if (!ctx || !data) {
            canvases.set(layer.id, canvas);
            resolve();
            return;
          }
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0);
            canvases.set(layer.id, canvas);
            resolve();
          };
          img.onerror = () => {
            canvases.set(layer.id, canvas);
            resolve();
          };
          img.src = data;
        }),
    ),
  );
  return canvases;
}

const EXPORT_FORMATS = [
  { id: "png", label: "PNG", mime: "image/png", ext: "png" },
  { id: "jpeg", label: "JPEG", mime: "image/jpeg", ext: "jpg", quality: 0.92 },
  { id: "webp", label: "WebP", mime: "image/webp", ext: "webp", quality: 0.92 },
] as const;

const TOOLS: { id: ToolId; label: string; hint: string }[] = [
  { id: "move", label: "Move", hint: "Drag the active layer" },
  { id: "brush", label: "Brush", hint: "Paint with pen styles" },
  { id: "eraser", label: "Eraser", hint: "Erase on the active layer" },
  { id: "fill", label: "Fill", hint: "Flood-fill an area" },
  { id: "line", label: "Line", hint: "Straight line" },
  { id: "rectangle", label: "Rect", hint: "Rectangle (hold Shift for square)" },
  { id: "ellipse", label: "Ellipse", hint: "Ellipse (hold Shift for circle)" },
  { id: "arrow", label: "Arrow", hint: "Arrow pointer" },
  { id: "text", label: "Text", hint: "Click to place text" },
];

export type PhotoshoppeEditorHandle = {
  getSnapshot: () => EditorSnapshot;
  getPreviewPng: () => string | null;
};

type Props = {
  storageKey?: string;
  loadedSnapshot?: EditorSnapshot | null;
  openToken?: number;
  documentName?: string;
  onBrowseLibrary?: () => void;
  onSaveDocument?: () => void;
  onSaveDocumentAs?: () => void;
};

export const PhotoshoppeEditor = forwardRef<PhotoshoppeEditorHandle, Props>(function PhotoshoppeEditor(
  {
    storageKey,
    loadedSnapshot = null,
    openToken = 0,
    documentName,
    onBrowseLibrary,
    onSaveDocument,
    onSaveDocumentAs,
  },
  ref,
) {
  const [doc, setDoc] = useState<DocSize>(DEFAULT_DOC);
  const [layers, setLayers] = useState<LayerModel[]>(() => [
    { id: uid(), name: "Background", visible: true, opacity: 1, x: 0, y: 0, locked: false },
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(() => layers[0]?.id ?? null);
  const layerCanvases = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const viewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const [tool, setTool] = useState<ToolId>("brush");
  const [color, setColor] = useState("#e11d48");
  const [brushSize, setBrushSize] = useState(8);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>("round");
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [shapeFill, setShapeFill] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [textDraft, setTextDraft] = useState("Your text");
  const [textStyle, setTextStyle] = useState<TextStyle>({
    fontFamily: FONT_FAMILIES[0],
    fontSize: 32,
    bold: false,
    italic: false,
    underline: false,
    color: "#111827",
    align: "left",
  });

  const history = useRef<EditorSnapshot[]>([]);
  const historyIndex = useRef(-1);
  const [, bumpRender] = useState(0);

  const pointer = useRef<{ x: number; y: number } | null>(null);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);

  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? null;

  const ensureCanvases = useCallback(() => {
    for (const layer of layers) {
      if (!layerCanvases.current.has(layer.id)) {
        const canvas = createLayerCanvas(doc);
        if (layer.name === "Background") {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, doc.width, doc.height);
          }
        }
        layerCanvases.current.set(layer.id, canvas);
      }
    }
  }, [doc, layers]);

  const composite = useCallback(() => {
    ensureCanvases();
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.width = doc.width;
    view.height = doc.height;
    const ctx = view.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, doc.width, doc.height);
    for (const layer of layers) {
      if (!layer.visible) {
        continue;
      }
      const canvas = layerCanvases.current.get(layer.id);
      if (!canvas) {
        continue;
      }
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(canvas, layer.x, layer.y);
    }
    ctx.globalAlpha = 1;
  }, [doc, ensureCanvases, layers]);

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }
    overlay.width = doc.width;
    overlay.height = doc.height;
    overlay.getContext("2d")?.clearRect(0, 0, doc.width, doc.height);
  }, [doc]);

  useEffect(() => {
    composite();
    clearOverlay();
  }, [composite, clearOverlay, layers, doc]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const commitSnapshot = useCallback(
    (layerList: LayerModel[], activeId: string | null) => {
      const snap = snapshotFrom(layerList, layerCanvases.current, doc, activeId);
      history.current = history.current.slice(0, historyIndex.current + 1);
      history.current.push(snap);
      if (history.current.length > 40) {
        history.current.shift();
      } else {
        historyIndex.current += 1;
      }
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(snap));
        } catch {
          // quota — ignore
        }
      }
    },
    [doc, storageKey],
  );

  const pushHistory = useCallback(() => {
    ensureCanvases();
    commitSnapshot(layers, activeLayerId);
  }, [activeLayerId, commitSnapshot, ensureCanvases, layers]);

  useImperativeHandle(
    ref,
    () => ({
      getSnapshot() {
        ensureCanvases();
        composite();
        return snapshotFrom(layers, layerCanvases.current, doc, activeLayerId);
      },
      getPreviewPng() {
        composite();
        return viewRef.current?.toDataURL("image/png") ?? null;
      },
    }),
    [activeLayerId, composite, doc, ensureCanvases, layers],
  );

  useEffect(() => {
    if (!loadedSnapshot || openToken === 0) {
      return;
    }
    let cancelled = false;
    void restoreSnapshot(loadedSnapshot).then((canvases) => {
      if (cancelled) {
        return;
      }
      setDoc(loadedSnapshot.doc);
      setLayers(loadedSnapshot.layers);
      setActiveLayerId(loadedSnapshot.activeLayerId);
      layerCanvases.current = canvases;
      history.current = [loadedSnapshot];
      historyIndex.current = 0;
      bumpRender((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [loadedSnapshot, openToken]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (openToken > 0 && loadedSnapshot) {
        return;
      }
      if (storageKey) {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          try {
            const snap = JSON.parse(raw) as EditorSnapshot;
            const canvases = await restoreSnapshot(snap);
            if (cancelled) {
              return;
            }
            setDoc(snap.doc);
            setLayers(snap.layers);
            setActiveLayerId(snap.activeLayerId);
            layerCanvases.current = canvases;
            history.current = [snap];
            historyIndex.current = 0;
            bumpRender((n) => n + 1);
            return;
          } catch {
            // fall through
          }
        }
      }
      ensureCanvases();
      pushHistory();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const applyHistory = (index: number) => {
    const snap = history.current[index];
    if (!snap) {
      return;
    }
    void restoreSnapshot(snap).then((canvases) => {
      setDoc(snap.doc);
      setLayers(snap.layers);
      setActiveLayerId(snap.activeLayerId);
      layerCanvases.current = canvases;
      historyIndex.current = index;
      bumpRender((n) => n + 1);
    });
  };

  const undo = () => {
    if (historyIndex.current <= 0) {
      return;
    }
    applyHistory(historyIndex.current - 1);
  };

  const redo = () => {
    if (historyIndex.current >= history.current.length - 1) {
      return;
    }
    applyHistory(historyIndex.current + 1);
  };

  const canvasPoint = (event: ReactPointerEvent, target: HTMLCanvasElement) => {
    const rect = target.getBoundingClientRect();
    const scaleX = doc.width / rect.width;
    const scaleY = doc.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const layerPoint = (point: { x: number; y: number }) => {
    if (!activeLayer) {
      return point;
    }
    return { x: point.x - activeLayer.x, y: point.y - activeLayer.y };
  };

  const getActiveCtx = () => {
    if (!activeLayer || activeLayer.locked) {
      return null;
    }
    ensureCanvases();
    const canvas = layerCanvases.current.get(activeLayer.id);
    return canvas?.getContext("2d") ?? null;
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!viewRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event, viewRef.current);
    pointer.current = point;

    if (tool === "move" && activeLayer && !activeLayer.locked) {
      drawing.current = true;
      return;
    }

    if (tool === "text") {
      const ctx = getActiveCtx();
      if (!ctx) {
        return;
      }
      const local = layerPoint(point);
      drawTextOnCanvas(ctx, textDraft, local.x, local.y, { ...textStyle, color: textStyle.color || color });
      composite();
      pushHistory();
      return;
    }

    if (tool === "fill") {
      const ctx = getActiveCtx();
      if (!ctx) {
        return;
      }
      const local = layerPoint(point);
      floodFill(ctx, local.x, local.y, color);
      composite();
      pushHistory();
      return;
    }

    if (tool === "brush" || tool === "eraser") {
      drawing.current = true;
      const ctx = getActiveCtx();
      if (!ctx) {
        return;
      }
      const local = layerPoint(point);
      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        applyBrushContext(ctx, "round", brushSize, "#000", 1);
      } else {
        ctx.globalCompositeOperation = "source-over";
        applyBrushContext(ctx, brushStyle, brushSize, color, brushOpacity);
      }
      ctx.beginPath();
      ctx.arc(local.x, local.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      composite();
      return;
    }

    if (tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "arrow") {
      shapeStart.current = point;
      drawing.current = true;
    }
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!viewRef.current || !drawing.current) {
      return;
    }
    const point = canvasPoint(event, viewRef.current);

    if (tool === "move" && activeLayer && pointer.current) {
      const dx = point.x - pointer.current.x;
      const dy = point.y - pointer.current.y;
      pointer.current = point;
      setLayers((current) =>
        current.map((layer) =>
          layer.id === activeLayer.id ? { ...layer, x: layer.x + dx, y: layer.y + dy } : layer,
        ),
      );
      composite();
      return;
    }

    if (tool === "brush" || tool === "eraser") {
      const ctx = getActiveCtx();
      if (!ctx || !pointer.current) {
        return;
      }
      const from = layerPoint(pointer.current);
      const to = layerPoint(point);
      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        strokePoint(ctx, "round", from, to, brushSize, "#000", 1);
      } else {
        ctx.globalCompositeOperation = "source-over";
        strokePoint(ctx, brushStyle, from, to, brushSize, color, brushOpacity);
      }
      ctx.globalCompositeOperation = "source-over";
      pointer.current = point;
      composite();
      return;
    }

    const start = shapeStart.current;
    const overlay = overlayRef.current;
    if (!start || !overlay) {
      return;
    }
    let end = point;
    if (event.shiftKey && (tool === "rectangle" || tool === "ellipse")) {
      const size = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
      end = {
        x: start.x + size * Math.sign(end.x - start.x || 1),
        y: start.y + size * Math.sign(end.y - start.y || 1),
      };
    }
    const octx = overlay.getContext("2d");
    if (!octx) {
      return;
    }
    overlay.width = doc.width;
    overlay.height = doc.height;
    octx.clearRect(0, 0, doc.width, doc.height);
    if (
      activeLayer &&
      (tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "arrow")
    ) {
      octx.save();
      octx.translate(activeLayer.x, activeLayer.y);
      drawShapePreview(octx, tool, layerPoint(start), layerPoint(end), color, brushSize, shapeFill);
      octx.restore();
    }
    pointer.current = point;
  };

  const onPointerUp = () => {
    if (!drawing.current) {
      return;
    }
    if (tool === "move") {
      drawing.current = false;
      pointer.current = null;
      pushHistory();
      return;
    }

    if ((tool === "brush" || tool === "eraser") && drawing.current) {
      drawing.current = false;
      pointer.current = null;
      pushHistory();
      return;
    }

    const start = shapeStart.current;
    const end = pointer.current;
    if (start && end && (tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "arrow")) {
      const ctx = getActiveCtx();
      if (ctx) {
        drawShapePreview(
          ctx,
          tool,
          layerPoint(start),
          layerPoint(end),
          color,
          brushSize,
          shapeFill,
        );
        composite();
        pushHistory();
      }
    }
    drawing.current = false;
    shapeStart.current = null;
    pointer.current = null;
    clearOverlay();
  };

  const addLayer = (name: string, setup?: (ctx: CanvasRenderingContext2D) => void) => {
    const id = uid();
    const canvas = createLayerCanvas(doc);
    const ctx = canvas.getContext("2d");
    if (ctx && setup) {
      setup(ctx);
    }
    layerCanvases.current.set(id, canvas);
    const newLayer: LayerModel = {
      id,
      name,
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      locked: false,
    };
    const nextLayers = [...layers, newLayer];
    flushSync(() => {
      setLayers(nextLayers);
      setActiveLayerId(id);
    });
    commitSnapshot(nextLayers, id);
  };

  const onAddImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? "");
      const img = new Image();
      img.onload = () => {
        addLayer(file.name.replace(/\.[^.]+$/, ""), (ctx) => {
          const scale = Math.min(1, doc.width / img.width, doc.height / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (doc.width - w) / 2, (doc.height - h) / 2, w, h);
        });
      };
      img.onerror = () => {
        window.alert("Could not load that image. Try JPEG or PNG.");
      };
      img.src = src;
    };
    reader.onerror = () => {
      window.alert("Could not read that file.");
    };
    reader.readAsDataURL(file);
  };

  const exportBaseName = () => (documentName?.trim() || "photoshoppe-lite").replace(/\.[^.]+$/, "");

  const exportImage = (formatId: (typeof EXPORT_FORMATS)[number]["id"]) => {
    composite();
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const format = EXPORT_FORMATS.find((item) => item.id === formatId) ?? EXPORT_FORMATS[0];
    const quality = "quality" in format ? format.quality : undefined;
    const dataUrl = view.toDataURL(format.mime, quality);
    const link = document.createElement("a");
    link.download = `${exportBaseName()}.${format.ext}`;
    link.href = dataUrl;
    link.click();
    setExportMenuOpen(false);
  };

  useEffect(() => {
    if (!exportMenuOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [exportMenuOpen]);

  const toolHint = useMemo(() => TOOLS.find((t) => t.id === tool)?.hint ?? "", [tool]);
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const activeToolLabel = TOOLS.find((t) => t.id === tool)?.label ?? tool;

  const paintTool =
    tool === "brush" ||
    tool === "eraser" ||
    tool === "line" ||
    tool === "rectangle" ||
    tool === "ellipse" ||
    tool === "arrow";

  return (
    <div className="ps-lite">
      <header className="ps-lite-menubar">
        {documentName ? (
          <span className="ps-lite-doc-title" title={documentName}>
            {documentName}
          </span>
        ) : null}
        <div className="ps-lite-menu-block">
          <span className="ps-lite-menu-title">File</span>
          {onBrowseLibrary ? (
            <button type="button" onClick={onBrowseLibrary}>
              Open…
            </button>
          ) : null}
          {onSaveDocument ? (
            <button type="button" onClick={onSaveDocument}>
              Save
            </button>
          ) : null}
          {onSaveDocumentAs ? (
            <button type="button" onClick={onSaveDocumentAs}>
              Save As…
            </button>
          ) : null}
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Place Embedded…
          </button>
          <div className="ps-lite-menu-export" ref={exportMenuRef}>
            <button type="button" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((open) => !open)}>
              Export…
            </button>
            {exportMenuOpen ? (
              <ul className="ps-lite-export-menu" role="menu">
                {EXPORT_FORMATS.map((format) => (
                  <li key={format.id} role="none">
                    <button type="button" role="menuitem" onClick={() => exportImage(format.id)}>
                      {format.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="ps-lite-menu-block">
          <span className="ps-lite-menu-title">Edit</span>
          <button type="button" onClick={undo}>
            Undo
          </button>
          <button type="button" onClick={redo}>
            Redo
          </button>
        </div>
        <div className="ps-lite-menu-block">
          <span className="ps-lite-menu-title">Layer</span>
          <button type="button" onClick={() => addLayer(`Layer ${layers.length + 1}`)}>
            New Layer
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onAddImage} />
      </header>

      <div className="ps-lite-options-bar" aria-label="Tool options">
        <div className="ps-lite-options-tool">
          <ToolIcon tool={tool} size={18} />
          <span>{activeToolLabel}</span>
          <span className="ps-lite-options-hint">{toolHint}</span>
        </div>

        <div className="ps-lite-options-divider" aria-hidden />

        {paintTool ? (
          <>
            <label className="ps-lite-swatch" title="Foreground color">
              <span className="ps-lite-swatch-bg" style={{ background: color }} />
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label className="ps-lite-opt">
              <span>Size</span>
              <input
                type="number"
                min={1}
                max={128}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
              <span>px</span>
            </label>
            {tool === "brush" ? (
              <>
                <label className="ps-lite-opt">
                  <span>Brush</span>
                  <select value={brushStyle} onChange={(e) => setBrushStyle(e.target.value as BrushStyle)}>
                    {BRUSH_STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ps-lite-opt">
                  <span>Opacity</span>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={Math.round(brushOpacity * 100)}
                    onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
                  />
                  <span>%</span>
                </label>
              </>
            ) : null}
            {(tool === "rectangle" || tool === "ellipse") && (
              <label className="ps-lite-opt ps-lite-opt-check">
                <input type="checkbox" checked={shapeFill} onChange={(e) => setShapeFill(e.target.checked)} />
                Fill
              </label>
            )}
          </>
        ) : null}

        {tool === "text" ? (
          <>
            <label className="ps-lite-swatch" title="Text color">
              <span className="ps-lite-swatch-bg" style={{ background: textStyle.color }} />
              <input
                type="color"
                value={textStyle.color}
                onChange={(e) => setTextStyle({ ...textStyle, color: e.target.value })}
              />
            </label>
            <label className="ps-lite-opt ps-lite-opt-grow">
              <span>Text</span>
              <input type="text" value={textDraft} onChange={(e) => setTextDraft(e.target.value)} />
            </label>
            <label className="ps-lite-opt">
              <span>Font</span>
              <select
                value={textStyle.fontFamily}
                onChange={(e) => setTextStyle({ ...textStyle, fontFamily: e.target.value })}
              >
                {FONT_FAMILIES.map((font) => (
                  <option key={font} value={font}>
                    {font.split(",")[0]}
                  </option>
                ))}
              </select>
            </label>
            <label className="ps-lite-opt">
              <span>Size</span>
              <input
                type="number"
                min={8}
                max={200}
                value={textStyle.fontSize}
                onChange={(e) => setTextStyle({ ...textStyle, fontSize: Number(e.target.value) })}
              />
            </label>
            <label className="ps-lite-opt ps-lite-opt-check">
              <input
                type="checkbox"
                checked={textStyle.bold}
                onChange={(e) => setTextStyle({ ...textStyle, bold: e.target.checked })}
              />
              Bold
            </label>
            <label className="ps-lite-opt ps-lite-opt-check">
              <input
                type="checkbox"
                checked={textStyle.italic}
                onChange={(e) => setTextStyle({ ...textStyle, italic: e.target.checked })}
              />
              Italic
            </label>
            <label className="ps-lite-opt">
              <span>Align</span>
              <select
                value={textStyle.align}
                onChange={(e) => setTextStyle({ ...textStyle, align: e.target.value as CanvasTextAlign })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </>
        ) : null}
      </div>

      <div className="ps-lite-workspace">
        <aside className="ps-lite-tool-rail" aria-label="Tools">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tool === item.id ? "active" : ""}
              title={`${item.label} — ${item.hint}`}
              aria-label={item.label}
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
            >
              <ToolIcon tool={item.id} />
            </button>
          ))}
        </aside>

        <main className="ps-lite-stage">
          <div className="ps-lite-stage-scroll">
            <div
              className="ps-lite-document"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            >
              <div className="ps-lite-canvas-stack">
                <canvas
                  ref={viewRef}
                  className="ps-lite-canvas"
                  width={doc.width}
                  height={doc.height}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
                <canvas
                  ref={overlayRef}
                  className="ps-lite-overlay"
                  width={doc.width}
                  height={doc.height}
                  aria-hidden
                />
              </div>
            </div>
          </div>
          <footer className="ps-lite-statusbar">
            <span>
              {doc.width} × {doc.height} px
            </span>
            <label className="ps-lite-status-zoom">
              <span>Zoom</span>
              <input
                type="range"
                min={0.35}
                max={1.5}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
              <span>{zoomLabel}</span>
            </label>
            <span className="ps-lite-status-tool">{activeToolLabel}</span>
          </footer>
        </main>

        <aside className="ps-lite-panel-dock">
          <div className="ps-lite-panel-header">
            <span className="active">Layers</span>
            <button type="button" className="ps-lite-panel-icon" title="New layer" onClick={() => addLayer(`Layer ${layers.length + 1}`)}>
              +
            </button>
          </div>
          <div className="ps-lite-panel-body">
            <ul className="ps-lite-layer-list">
              {[...layers].reverse().map((layer) => (
                <li key={layer.id} className={layer.id === activeLayerId ? "active" : ""}>
                  <div className="ps-lite-layer-row">
                    <button
                      type="button"
                      className={`ps-lite-layer-eye${layer.visible ? "" : " off"}`}
                      title={layer.visible ? "Hide layer" : "Show layer"}
                      aria-pressed={layer.visible}
                      onClick={() =>
                        setLayers((current) =>
                          current.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="ps-lite-layer-thumb"
                      title="Select layer"
                      onClick={() => setActiveLayerId(layer.id)}
                    />
                    <button type="button" className="ps-lite-layer-name" onClick={() => setActiveLayerId(layer.id)}>
                      {layer.name}
                      {layer.locked ? <span className="ps-lite-layer-lock-badge">🔒</span> : null}
                    </button>
                  </div>
                  {layer.id === activeLayerId ? (
                    <label className="ps-lite-layer-opacity">
                      <span>Opacity</span>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={layer.opacity}
                        onChange={(e) =>
                          setLayers((current) =>
                            current.map((l) => (l.id === layer.id ? { ...l, opacity: Number(e.target.value) } : l)),
                          )
                        }
                      />
                      <span>{Math.round(layer.opacity * 100)}%</span>
                    </label>
                  ) : null}
                  {layer.id === activeLayerId ? (
                    <div className="ps-lite-layer-actions">
                      <button
                        type="button"
                        title="Move up"
                        onClick={() => {
                          setLayers((current) => {
                            const index = current.findIndex((l) => l.id === layer.id);
                            if (index < 0 || index >= current.length - 1) {
                              return current;
                            }
                            const next = [...current];
                            [next[index], next[index + 1]] = [next[index + 1], next[index]];
                            return next;
                          });
                          pushHistory();
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        onClick={() => {
                          setLayers((current) => {
                            const index = current.findIndex((l) => l.id === layer.id);
                            if (index <= 0) {
                              return current;
                            }
                            const next = [...current];
                            [next[index], next[index - 1]] = [next[index - 1], next[index]];
                            return next;
                          });
                          pushHistory();
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        title={layer.locked ? "Unlock" : "Lock"}
                        onClick={() =>
                          setLayers((current) =>
                            current.map((l) => (l.id === layer.id ? { ...l, locked: !l.locked } : l)),
                          )
                        }
                      >
                        {layer.locked ? "Unlock" : "Lock"}
                      </button>
                      <button
                        type="button"
                        disabled={layers.length <= 1}
                        title="Delete layer"
                        onClick={() => {
                          if (layers.length <= 1) {
                            return;
                          }
                          layerCanvases.current.delete(layer.id);
                          setLayers((current) => current.filter((l) => l.id !== layer.id));
                          if (activeLayerId === layer.id) {
                            setActiveLayerId(layers.find((l) => l.id !== layer.id)?.id ?? null);
                          }
                          pushHistory();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
});
