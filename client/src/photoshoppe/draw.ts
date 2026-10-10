import type { BrushStyle, TextStyle } from "./types";

export function applyBrushContext(
  ctx: CanvasRenderingContext2D,
  style: BrushStyle,
  size: number,
  color: string,
  opacity: number,
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.globalAlpha = opacity;
  ctx.lineJoin = style === "square" ? "miter" : "round";
  ctx.lineCap = style === "square" ? "square" : "round";

  if (style === "pencil") {
    ctx.lineWidth = Math.max(1, Math.min(2, size / 8));
    ctx.globalAlpha = opacity;
  } else if (style === "marker") {
    ctx.globalAlpha = opacity * 0.45;
    ctx.lineWidth = size * 1.15;
  } else if (style === "airbrush") {
    ctx.globalAlpha = opacity * 0.2;
    ctx.lineWidth = size * 1.4;
    ctx.shadowBlur = size * 0.35;
    ctx.shadowColor = color;
  } else {
    ctx.shadowBlur = 0;
  }
}

export function strokePoint(
  ctx: CanvasRenderingContext2D,
  style: BrushStyle,
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
  color: string,
  opacity: number,
) {
  applyBrushContext(ctx, style, size, color, opacity);
  if (style === "calligraphy") {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const w = size * 0.35;
    const h = size * 1.1;
    ctx.save();
    ctx.translate(to.x, to.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, h, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (style === "airbrush") {
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    return;
  }
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  kind: "line" | "rectangle" | "ellipse" | "arrow",
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
  size: number,
  fill: boolean,
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;

  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  if (kind === "line") {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    return;
  }
  if (kind === "rectangle") {
    if (fill) {
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.strokeRect(x, y, w, h);
    }
    return;
  }
  if (kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.5), Math.max(h / 2, 0.5), 0, 0, Math.PI * 2);
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
    return;
  }
  // arrow
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(10, size * 3);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

export function drawTextOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
) {
  const weight = style.bold ? "700" : "400";
  const slant = style.italic ? "italic" : "normal";
  ctx.font = `${slant} ${weight} ${style.fontSize}px ${style.fontFamily}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = "top";
  ctx.globalAlpha = 1;
  const lines = text.split("\n");
  const lineHeight = style.fontSize * 1.25;
  lines.forEach((line, index) => {
    const ly = y + index * lineHeight;
    ctx.fillText(line, x, ly);
    if (style.underline && line) {
      const width = ctx.measureText(line).width;
      let ux = x;
      if (style.align === "center") {
        ux = x - width / 2;
      } else if (style.align === "right") {
        ux = x - width;
      }
      ctx.beginPath();
      ctx.moveTo(ux, ly + style.fontSize + 2);
      ctx.lineTo(ux + width, ly + style.fontSize + 2);
      ctx.lineWidth = Math.max(1, style.fontSize / 14);
      ctx.strokeStyle = style.color;
      ctx.stroke();
    }
  });
}

export function floodFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fillColor: string,
  tolerance = 32,
) {
  const { width, height } = ctx.canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const startX = Math.floor(x);
  const startY = Math.floor(y);
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
    return;
  }
  const startIdx = (startY * width + startX) * 4;
  const target = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];
  const fill = parseColor(fillColor);
  if (!fill) {
    return;
  }
  if (colorsMatch(target, fill, 0)) {
    return;
  }
  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  function match(idx: number) {
    return (
      Math.abs(data[idx] - target[0]) <= tolerance &&
      Math.abs(data[idx + 1] - target[1]) <= tolerance &&
      Math.abs(data[idx + 2] - target[2]) <= tolerance &&
      Math.abs(data[idx + 3] - target[3]) <= tolerance
    );
  }

  while (stack.length > 0) {
    const [px, py] = stack.pop()!;
    const pos = py * width + px;
    if (visited[pos]) {
      continue;
    }
    visited[pos] = 1;
    const idx = pos * 4;
    if (!match(idx)) {
      continue;
    }
    data[idx] = fill[0];
    data[idx + 1] = fill[1];
    data[idx + 2] = fill[2];
    data[idx + 3] = 255;
    if (px > 0) {
      stack.push([px - 1, py]);
    }
    if (px < width - 1) {
      stack.push([px + 1, py]);
    }
    if (py > 0) {
      stack.push([px, py - 1]);
    }
    if (py < height - 1) {
      stack.push([px, py + 1]);
    }
  }
  ctx.putImageData(image, 0, 0);
}

function parseColor(color: string): [number, number, number, number] | null {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = color;
  const normalized = ctx.fillStyle;
  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const num = Number.parseInt(full, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
  }
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(normalized);
  if (m) {
    return [Number(m[1]), Number(m[2]), Number(m[3]), 255];
  }
  return null;
}

function colorsMatch(a: number[], b: [number, number, number, number], tolerance: number) {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  );
}
