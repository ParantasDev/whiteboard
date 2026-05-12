"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  DrawElement,
  Point,
  RemoteCursor,
  RemotePreview,
  ToolType,
  StrokeElement,
  RectElement,
  EllipseElement,
  LineElement,
  ArrowElement,
  TextElement,
  ImageElement,
} from "@/types/whiteboard";

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  "#1e293b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff",
];

const STROKE_WIDTHS = [2, 6, 14];
const PLAYER_COLORS = ["#6366f1", "#f59e0b"];
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;

const FONT_SIZES = [14, 20, 28, 40];

const TOOL_LABELS: Record<ToolType, string> = {
  select: "Select",
  pen: "Pen",
  rect: "Rect",
  ellipse: "Ellipse",
  line: "Line",
  arrow: "Arrow",
  text: "Text",
  eraser: "Eraser",
  fill: "Fill",
  laser: "Laser",
};

const TOOL_TIPS: Record<ToolType, string> = {
  select: "Click · shift+click · drag to select · drag selection to move · right-click for options",
  pen: "Draw freehand",
  rect: "Click & drag · Shift for square",
  ellipse: "Click & drag · Shift for circle",
  line: "Click & drag · Shift to snap 45°",
  arrow: "Click & drag · Shift to snap 45°",
  text: "Click anywhere to place text, then press Enter",
  eraser: "Click & drag to erase",
  fill: "Click a shape to fill it with the selected color",
  laser: "Laser pointer — traces fade after 2 seconds",
};

const TOOL_ICONS: Record<ToolType, React.ReactNode> = {
  select: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M4 2.5l16 10.5-7.5 1.5L9 22z" />
    </svg>
  ),
  pen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  rect: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  ),
  ellipse: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <ellipse cx="12" cy="12" rx="10" ry="6" />
    </svg>
  ),
  line: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5">
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="5" y1="19" x2="19" y2="5" />
      <polyline points="8 5 19 5 19 16" />
    </svg>
  ),
  text: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  eraser: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M20 20H7L3 16l10-10 7 7-2.5 2.5" />
      <path d="M6.0006 11L13 18" />
    </svg>
  ),
  fill: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-5 h-5">
      <path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0C19 10.5 12 2 12 2z" />
    </svg>
  ),
  laser: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
};

// ── Image cache (url → HTMLImageElement) ──────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): HTMLImageElement {
  if (imageCache.has(url)) return imageCache.get(url)!;
  const img = new Image();
  img.src = url;
  imageCache.set(url, img);
  return img;
}

// ── Flood fill ────────────────────────────────────────────────────────────────

function floodFillImageData(
  imageData: ImageData,
  startX: number,
  startY: number,
  fillHex: string
): void {
  const { width, height, data } = imageData;
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  const fr = parseInt(fillHex.slice(1, 3), 16);
  const fg = parseInt(fillHex.slice(3, 5), 16);
  const fb = parseInt(fillHex.slice(5, 7), 16);

  const si = (startY * width + startX) * 4;
  const startBrightness = (data[si] + data[si + 1] + data[si + 2]) / 3;
  // Don't fill dark outline pixels
  if (data[si + 3] > 128 && startBrightness < 80) return;
  // Already this color
  if (data[si] === fr && data[si + 1] === fg && data[si + 2] === fb) return;

  const stack: number[] = [startY * width + startX];
  const visited = new Uint8Array(width * height);
  visited[startY * width + startX] = 1;

  while (stack.length > 0) {
    const pos = stack.pop()!;
    const x = pos % width;
    const y = Math.floor(pos / width);
    const i = pos * 4;
    data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255;

    const neighbors = [
      x > 0 ? pos - 1 : -1,
      x < width - 1 ? pos + 1 : -1,
      y > 0 ? pos - width : -1,
      y < height - 1 ? pos + width : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || visited[n]) continue;
      const ni = n * 4;
      const brightness = (data[ni] + data[ni + 1] + data[ni + 2]) / 3;
      // Stop at dark (outline) pixels
      if (data[ni + 3] > 128 && brightness < 80) continue;
      visited[n] = 1;
      stack.push(n);
    }
  }
}

const imageFillCache = new Map<string, HTMLCanvasElement>();

function getFilledImageCanvas(el: ImageElement): HTMLCanvasElement | null {
  const cacheKey = `${el.url}|${JSON.stringify(el.fills ?? [])}`;
  if (imageFillCache.has(cacheKey)) return imageFillCache.get(cacheKey)!;

  const img = loadImage(el.url);
  if (!img.complete || img.naturalWidth === 0) return null;

  // Render at a consistent pixel resolution (longest side = 1200px)
  const aspect = el.w / el.h;
  const cw = aspect >= 1 ? 1200 : Math.round(1200 * aspect);
  const ch = aspect >= 1 ? Math.round(1200 / aspect) : 1200;

  const offscreen = document.createElement("canvas");
  offscreen.width = cw;
  offscreen.height = ch;
  const ctx = offscreen.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, cw, ch);

  for (const fill of el.fills ?? []) {
    const fx = Math.round((fill.wx - el.x) / el.w * cw);
    const fy = Math.round((fill.wy - el.y) / el.h * ch);
    try {
      const imageData = ctx.getImageData(0, 0, cw, ch);
      floodFillImageData(imageData, fx, fy, fill.color);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      break; // canvas tainted — shouldn't happen with proxy URL
    }
  }

  imageFillCache.set(cacheKey, offscreen);
  return offscreen;
}

// ── Canvas drawing helpers ─────────────────────────────────────────────────────

function drawSmoothedStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number
) {
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  width: number,
  color: string
) {
  const headLen = Math.max(16, width * 4);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function renderElement(ctx: CanvasRenderingContext2D, el: DrawElement) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (el.type) {
    case "stroke":
      if (el.fillColor && el.points.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length - 1; i++) {
          const mx = (el.points[i].x + el.points[i + 1].x) / 2;
          const my = (el.points[i].y + el.points[i + 1].y) / 2;
          ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, mx, my);
        }
        ctx.closePath();
        ctx.fillStyle = el.fillColor;
        ctx.fill();
        ctx.restore();
      }
      drawSmoothedStroke(ctx, el.points, el.color, el.width);
      break;
    case "rect": {
      const rot = el.rotation ?? 0;
      if (rot !== 0) {
        ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        ctx.rotate(rot);
        ctx.translate(-(el.w / 2), -(el.h / 2));
      } else {
        ctx.translate(el.x, el.y);
      }
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      if (el.fillColor) {
        ctx.fillStyle = el.fillColor;
        ctx.fillRect(0, 0, el.w, el.h);
      } else if (el.filled) {
        ctx.fillStyle = el.color + "33";
        ctx.fillRect(0, 0, el.w, el.h);
      }
      ctx.strokeRect(0, 0, el.w, el.h);
      break;
    }
    case "ellipse": {
      const rot = el.rotation ?? 0;
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.ellipse(el.cx, el.cy, el.rx, el.ry, rot, 0, Math.PI * 2);
      if (el.fillColor) {
        ctx.fillStyle = el.fillColor;
        ctx.fill();
      } else if (el.filled) {
        ctx.fillStyle = el.color + "33";
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case "line":
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      break;
    case "arrow": {
      const aHeadLen = Math.max(16, el.width * 4);
      const aAngle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2 - aHeadLen * Math.cos(aAngle), el.y2 - aHeadLen * Math.sin(aAngle));
      ctx.stroke();
      drawArrowHead(ctx, el.x1, el.y1, el.x2, el.y2, el.width, el.color);
      break;
    }
    case "text": {
      const rot = el.rotation ?? 0;
      const lines = el.text.split("\n");
      const lineH = el.fontSize * 1.3;
      const approxW = Math.max(...lines.map((l) => l.length)) * el.fontSize * 0.55 + 16;
      const totalH = lines.length * lineH;
      if (rot !== 0) {
        const cx = el.x + approxW / 2;
        const cy = el.y - el.fontSize + totalH / 2;
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.translate(-cx, -cy);
      }
      ctx.fillStyle = el.color;
      ctx.font = `${el.fontSize}px sans-serif`;
      lines.forEach((line, i) => {
        ctx.fillText(line, el.x, el.y + i * lineH);
      });
      break;
    }
    case "image": {
      const rot = el.rotation ?? 0;
      if (rot !== 0) {
        ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        ctx.rotate(rot);
        ctx.translate(-el.w / 2, -el.h / 2);
      } else {
        ctx.translate(el.x, el.y);
      }
      if (el.fills && el.fills.length > 0) {
        const filled = getFilledImageCanvas(el);
        if (filled) {
          ctx.drawImage(filled, 0, 0, el.w, el.h);
        } else {
          const img = loadImage(el.url);
          if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, el.w, el.h);
        }
      } else {
        const img = loadImage(el.url);
        if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, el.w, el.h);
      }
      break;
    }
  }
  ctx.restore();
}

// ── Text cursor helpers ────────────────────────────────────────────────────────

function getLineCol(text: string, pos: number): { line: number; col: number } {
  const lines = text.split("\n");
  let remaining = pos;
  for (let i = 0; i < lines.length; i++) {
    if (remaining <= lines[i].length) return { line: i, col: remaining };
    remaining -= lines[i].length + 1;
  }
  return { line: lines.length - 1, col: lines[lines.length - 1].length };
}

function moveCursorVertical(text: string, pos: number, dir: 1 | -1): number {
  const lines = text.split("\n");
  const { line, col } = getLineCol(text, pos);
  const newLine = Math.max(0, Math.min(lines.length - 1, line + dir));
  if (newLine === line) return dir < 0 ? 0 : text.length;
  let start = 0;
  for (let i = 0; i < newLine; i++) start += lines[i].length + 1;
  return start + Math.min(col, lines[newLine].length);
}

function findCharInLine(ctx: CanvasRenderingContext2D, line: string, relX: number): number {
  if (relX <= 0) return 0;
  for (let i = 1; i <= line.length; i++) {
    const mid = (ctx.measureText(line.slice(0, i - 1)).width + ctx.measureText(line.slice(0, i)).width) / 2;
    if (relX < mid) return i - 1;
  }
  return line.length;
}

// ── Text hit detection ────────────────────────────────────────────────────────

function hitTestText(el: TextElement, wx: number, wy: number): boolean {
  const lines = el.text.split("\n");
  const lineH = el.fontSize * 1.3;
  const approxW = Math.max(...lines.map((l) => l.length)) * el.fontSize * 0.55 + 16;
  const totalH = lines.length * lineH;
  return (
    wx >= el.x - 4 && wx <= el.x + approxW &&
    wy >= el.y - el.fontSize - 4 && wy <= el.y - el.fontSize + totalH + 4
  );
}

// ── Eraser hit detection ───────────────────────────────────────────────────────

function elementHitByEraser(el: DrawElement, eraserPoints: Point[], radius: number): boolean {
  switch (el.type) {
    case "stroke":
      return el.points.some((p) => eraserPoints.some((ep) => Math.hypot(p.x - ep.x, p.y - ep.y) < radius));
    case "rect":
      return eraserPoints.some((ep) =>
        ep.x >= el.x - radius && ep.x <= el.x + el.w + radius &&
        ep.y >= el.y - radius && ep.y <= el.y + el.h + radius
      );
    case "ellipse":
      return eraserPoints.some((ep) => Math.hypot(ep.x - el.cx, ep.y - el.cy) < Math.max(el.rx, el.ry) + radius);
    case "line":
    case "arrow": {
      const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
      const lenSq = dx * dx + dy * dy;
      return eraserPoints.some((ep) => {
        if (lenSq < 1) return false;
        const t = Math.max(0, Math.min(1, ((ep.x - el.x1) * dx + (ep.y - el.y1) * dy) / lenSq));
        return Math.hypot(ep.x - (el.x1 + t * dx), ep.y - (el.y1 + t * dy)) < radius;
      });
    }
    case "text":
      return eraserPoints.some((ep) =>
        ep.x >= el.x - radius && ep.x <= el.x + 300 &&
        ep.y >= el.y - el.fontSize - radius && ep.y <= el.y + radius
      );
    case "image":
      return eraserPoints.some((ep) =>
        ep.x >= el.x - radius && ep.x <= el.x + el.w + radius &&
        ep.y >= el.y - radius && ep.y <= el.y + el.h + radius
      );
  }
}

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────

function pointInPath(points: Point[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Select tool helpers ───────────────────────────────────────────────────────

function rotatedBounds(cx: number, cy: number, w: number, h: number, rot: number) {
  const hw = w / 2, hh = h / 2;
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const rxs = corners.map(([x, y]) => cx + x * cos - y * sin);
  const rys = corners.map(([x, y]) => cy + x * sin + y * cos);
  const minX = Math.min(...rxs), minY = Math.min(...rys);
  return { x: minX, y: minY, w: Math.max(...rxs) - minX, h: Math.max(...rys) - minY };
}

function getBounds(el: DrawElement): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case "stroke": {
      const xs = el.points.map((p) => p.x);
      const ys = el.points.map((p) => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
    case "rect": {
      const rot = el.rotation ?? 0;
      if (rot !== 0) return rotatedBounds(el.x + el.w / 2, el.y + el.h / 2, el.w, el.h, rot);
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    }
    case "ellipse":
      return { x: el.cx - el.rx, y: el.cy - el.ry, w: el.rx * 2, h: el.ry * 2 };
    case "line":
    case "arrow": {
      const minX = Math.min(el.x1, el.x2), minY = Math.min(el.y1, el.y2);
      return { x: minX, y: minY, w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
    }
    case "text": {
      const lines = el.text.split("\n");
      const approxW = Math.max(...lines.map((l) => l.length)) * el.fontSize * 0.55 + 16;
      return { x: el.x, y: el.y - el.fontSize, w: approxW, h: lines.length * el.fontSize * 1.3 };
    }
    case "image": {
      const rot = el.rotation ?? 0;
      if (rot !== 0) return rotatedBounds(el.x + el.w / 2, el.y + el.h / 2, el.w, el.h, rot);
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    }
  }
}

function hitTestElement(el: DrawElement, wx: number, wy: number): boolean {
  const pad = el.type === "line" || el.type === "arrow" || el.type === "stroke" ? 10 : 4;
  const b = getBounds(el);
  return wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad;
}

function elementInRect(el: DrawElement, minX: number, minY: number, maxX: number, maxY: number): boolean {
  const b = getBounds(el);
  return b.x < maxX && b.x + b.w > minX && b.y < maxY && b.y + b.h > minY;
}

function translateElement(el: DrawElement, dx: number, dy: number): DrawElement {
  switch (el.type) {
    case "stroke":
      return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "rect":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "ellipse":
      return { ...el, cx: el.cx + dx, cy: el.cy + dy };
    case "line":
    case "arrow":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "text":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "image":
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

function scaleElement(
  el: DrawElement,
  orig: { x: number; y: number; w: number; h: number },
  next: { x: number; y: number; w: number; h: number }
): DrawElement {
  const { x: ox, y: oy, w: ow, h: oh } = orig;
  const { x: nx, y: ny, w: nw, h: nh } = next;
  const sp = (px: number, py: number) => ({
    x: nx + (ow > 0 ? ((px - ox) / ow) * nw : 0),
    y: ny + (oh > 0 ? ((py - oy) / oh) * nh : 0),
  });
  switch (el.type) {
    case "stroke":
      return { ...el, points: el.points.map((p) => sp(p.x, p.y)) };
    case "line":
    case "arrow": {
      const p1 = sp(el.x1, el.y1), p2 = sp(el.x2, el.y2);
      return { ...el, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    case "text": {
      const newFs = Math.max(8, Math.round(el.fontSize * (oh > 0 ? nh / oh : 1)));
      return { ...el, x: nx, y: ny + newFs, fontSize: newFs };
    }
    case "rect":
      return { ...el, x: nx, y: ny, w: Math.max(10, nw), h: Math.max(10, nh) };
    case "ellipse":
      return { ...el, cx: nx + nw / 2, cy: ny + nh / 2, rx: Math.max(5, nw / 2), ry: Math.max(5, nh / 2) };
    case "image":
      return { ...el, x: nx, y: ny, w: Math.max(10, nw), h: Math.max(10, nh) };
  }
}

function rotateCoords(el: DrawElement, angle: number): DrawElement {
  const b = getBounds(el);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rp = (x: number, y: number) => ({
    x: cx + (x - cx) * cos - (y - cy) * sin,
    y: cy + (x - cx) * sin + (y - cy) * cos,
  });
  if (el.type === "stroke") return { ...el, points: el.points.map((p) => rp(p.x, p.y)) };
  if (el.type === "line" || el.type === "arrow") {
    const p1 = rp(el.x1, el.y1), p2 = rp(el.x2, el.y2);
    return { ...el, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  return { ...el, rotation: angle } as DrawElement;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PreviewShape =
  | { type: "stroke"; points: Point[]; color: string; width: number }
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string; width: number; filled: boolean }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; color: string; width: number; filled: boolean }
  | { type: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number };

interface ColoringPage {
  filename: string;
  name: string;
  url: string;
}

interface WhiteboardCanvasProps {
  elements: DrawElement[];
  remoteCursor: RemoteCursor | null;
  remotePreview: RemotePreview | null;
  playerIndex: number;
  onElementComplete: (el: DrawElement) => void;
  onPreviewUpdate: (preview: RemotePreview | null) => void;
  onCursorMove: (x: number, y: number, isLaser?: boolean, isDrawing?: boolean) => void;
  onUndo: (playerIndex: number) => void;
  onErase: (ids: string[]) => void;
  onClear: () => void;
  onReorder: (id: string, action: string) => void;
  onMoveElements: (elements: DrawElement[]) => void;
}

interface TextInputState {
  worldX: number;
  worldY: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WhiteboardCanvas({
  elements,
  remoteCursor,
  remotePreview,
  playerIndex,
  onElementComplete,
  onPreviewUpdate,
  onCursorMove,
  onUndo,
  onErase,
  onClear,
  onReorder,
  onMoveElements,
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // View (pan + zoom)
  const viewRef = useRef({ panX: 0, panY: 0, zoom: 1 });
  const [zoomDisplay, setZoomDisplay] = useState(100);

  // Panning
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ screenX: 0, screenY: 0, panX: 0, panY: 0 });
  const spaceDownRef = useRef(false);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

  // Tools / appearance
  const [tool, setTool] = useState<ToolType>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [filled, setFilled] = useState(false);
  const [fontSize, setFontSize] = useState(28);

  // Text input (canvas-based)
  const [textInput, setTextInput] = useState<TextInputState | null>(null);
  const [textValue, setTextValue] = useState("");
  const textValueRef = useRef("");
  const textInputPosRef = useRef<TextInputState | null>(null);
  const textActiveRef = useRef(false);
  const cursorPosRef = useRef(0);
  const selectionStartRef = useRef<number | null>(null);
  const textDragRef = useRef<boolean>(false);

  // Drawing state
  const drawingRef = useRef({ active: false, startX: 0, startY: 0, points: [] as Point[] });
  const previewRef = useRef<PreviewShape | null>(null);
  const eraserRef = useRef<Point[]>([]);
  const lastSocketSendRef = useRef(0);
  const mousePosRef = useRef<Point | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);

  // Drag state for select tool (holds snapshots of all selected elements at drag start)
  const dragStateRef = useRef<{
    active: boolean;
    elementSnapshots: DrawElement[];
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Marquee (drag-to-select) state
  const marqueeRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Context menu: holds the IDs to act on (either the selection or a single right-clicked element)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementIds: string[] } | null>(null);

  // Undo/redo history
  const undoStackRef = useRef<Array<{ added: DrawElement[]; removed: DrawElement[] }>>([]);
  const redoStackRef = useRef<Array<{ added: DrawElement[]; removed: DrawElement[] }>>([]);

  // Clipboard
  const clipboardRef = useRef<DrawElement[]>([]);

  // Laser pointer: timestamped trail points
  const laserTrailRef = useRef<Array<{ x: number; y: number; t: number }>>([]);

  // Partner edge indicator + smooth pan-to-partner
  const edgeIndicatorRef = useRef<{ x: number; y: number } | null>(null);
  const panTargetRef = useRef<{ panX: number; panY: number } | null>(null);
  const remoteCursorRef = useRef<RemoteCursor | null>(null);
  const remoteLaserTrailRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  useEffect(() => {
    remoteCursorRef.current = remoteCursor;
    if (remoteCursor?.isLaser && remoteCursor.isDrawing) {
      remoteLaserTrailRef.current.push({ x: remoteCursor.x, y: remoteCursor.y, t: Date.now() });
    }
  }, [remoteCursor]);

  // Resize/rotation handle drag state
  const handleDragRef = useRef<{
    type: "resize" | "rotate";
    elementId: string;
    originalSnapshot: DrawElement;
    snapshot: DrawElement; // updated live during drag
    handle: string; // "nw"|"ne"|"sw"|"se"|"rot"
    startX: number;
    startY: number;
  } | null>(null);

  // Coloring pages
  const [coloringPages, setColoringPages] = useState<ColoringPage[]>([]);
  const [showColoringPanel, setShowColoringPanel] = useState(false);

  // Stable refs for callbacks
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  const filledRef = useRef(filled);
  const fontSizeRef = useRef(fontSize);
  const playerIndexRef = useRef(playerIndex);
  const elementsRef = useRef(elements);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
  useEffect(() => { filledRef.current = filled; }, [filled]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);
  useEffect(() => { playerIndexRef.current = playerIndex; }, [playerIndex]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { textValueRef.current = textValue; }, [textValue]);
  useEffect(() => { textInputPosRef.current = textInput; textActiveRef.current = !!textInput; }, [textInput]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // ── Fetch coloring pages ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/coloring-pages")
      .then((r) => r.json())
      .then(setColoringPages)
      .catch(() => {});
  }, []);

  // ── Canvas resize ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const setSize = () => {
      canvas.width = wrapper.clientWidth;
      canvas.height = wrapper.clientHeight;
    };
    setSize();
    const observer = new ResizeObserver(setSize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // ── Coordinate helpers ────────────────────────────────────────────────────────

  const toCanvas = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const { panX, panY, zoom } = viewRef.current;
    return {
      x: (clientX - r.left - panX) / zoom,
      y: (clientY - r.top - panY) / zoom,
    };
  }, []);

  // ── Rendering ─────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const { panX, panY, zoom } = viewRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    ctx.setTransform(zoom, 0, 0, zoom, panX, panY);

    // Committed elements — skip elements currently being dragged
    const ds = dragStateRef.current;
    const draggingSet = ds?.active ? new Set(ds.elementSnapshots.map((e) => e.id)) : null;
    for (const el of elementsRef.current) {
      if (draggingSet?.has(el.id)) continue;
      renderElement(ctx, el);
    }

    // Dragged elements rendered at their offset position
    if (ds?.active) {
      const dx = ds.currentX - ds.startX;
      const dy = ds.currentY - ds.startY;
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (const snap of ds.elementSnapshots) {
        renderElement(ctx, translateElement(snap, dx, dy));
      }
      ctx.restore();
    }

    // Remote preview
    if (remotePreview) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      const rp = remotePreview;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (rp.type === "stroke") {
        drawSmoothedStroke(ctx, rp.points, rp.color, rp.width);
      } else if (rp.type === "rect") {
        ctx.strokeStyle = rp.color; ctx.lineWidth = rp.width;
        ctx.strokeRect(rp.x, rp.y, rp.w, rp.h);
      } else if (rp.type === "ellipse") {
        ctx.strokeStyle = rp.color; ctx.lineWidth = rp.width;
        ctx.beginPath(); ctx.ellipse(rp.cx, rp.cy, rp.rx, rp.ry, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (rp.type === "line" || rp.type === "arrow") {
        ctx.strokeStyle = rp.color; ctx.lineWidth = rp.width;
        ctx.beginPath();
        ctx.moveTo(rp.x1, rp.y1);
        if (rp.type === "arrow") {
          const rpHL = Math.max(16, rp.width * 4);
          const rpA = Math.atan2(rp.y2 - rp.y1, rp.x2 - rp.x1);
          ctx.lineTo(rp.x2 - rpHL * Math.cos(rpA), rp.y2 - rpHL * Math.sin(rpA));
        } else {
          ctx.lineTo(rp.x2, rp.y2);
        }
        ctx.stroke();
        if (rp.type === "arrow") drawArrowHead(ctx, rp.x1, rp.y1, rp.x2, rp.y2, rp.width, rp.color);
      }
      ctx.restore();
    }

    // Local preview
    const p = previewRef.current;
    if (p) {
      ctx.save();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = p.color; ctx.lineWidth = p.width;
      if (p.type === "stroke") {
        drawSmoothedStroke(ctx, p.points, p.color, p.width);
      } else if (p.type === "rect") {
        if (p.filled) { ctx.fillStyle = p.color + "33"; ctx.fillRect(p.x, p.y, p.w, p.h); }
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      } else if (p.type === "ellipse") {
        ctx.beginPath(); ctx.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, Math.PI * 2);
        if (p.filled) { ctx.fillStyle = p.color + "33"; ctx.fill(); }
        ctx.stroke();
      } else if (p.type === "line" || p.type === "arrow") {
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        if (p.type === "arrow") {
          const pHL = Math.max(16, p.width * 4);
          const pA = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
          ctx.lineTo(p.x2 - pHL * Math.cos(pA), p.y2 - pHL * Math.sin(pA));
        } else {
          ctx.lineTo(p.x2, p.y2);
        }
        ctx.stroke();
        if (p.type === "arrow") drawArrowHead(ctx, p.x1, p.y1, p.x2, p.y2, p.width, p.color);
      }
      ctx.restore();
    }

    // Text preview while typing
    if (textInputPosRef.current) {
      const { worldX, worldY } = textInputPosRef.current;
      const tv = textValueRef.current;
      const lines = tv.split("\n");
      const fs = fontSizeRef.current;
      const lineH = fs * 1.3;
      const showCursor = Math.floor(Date.now() / 530) % 2 === 0;
      const selStart = selectionStartRef.current;
      const curPos = cursorPosRef.current;
      const hasSelection = selStart !== null && selStart !== curPos;

      ctx.save();
      ctx.font = `${fs}px sans-serif`;

      // Draw selection background
      if (hasSelection) {
        const selectionStart = Math.min(selStart!, curPos);
        const selectionEnd = Math.max(selStart!, curPos);
        ctx.fillStyle = "rgba(99, 102, 241, 0.3)";

        let charPos = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineStart = charPos;
          const lineEnd = charPos + line.length;

          if (selectionEnd > lineStart && selectionStart < lineEnd) {
            const colStart = Math.max(0, selectionStart - lineStart);
            const colEnd = Math.min(line.length, selectionEnd - lineStart);
            const selX1 = worldX + ctx.measureText(line.slice(0, colStart)).width;
            const selX2 = worldX + ctx.measureText(line.slice(0, colEnd)).width;
            const selY1 = worldY + i * lineH - fs * 0.85;
            ctx.fillRect(selX1, selY1, selX2 - selX1, fs * 1.1);
          }
          charPos = lineEnd + 1;
        }
      }

      ctx.fillStyle = colorRef.current;
      lines.forEach((line, i) => ctx.fillText(line, worldX, worldY + i * lineH));
      if (showCursor) {
        const { line: curLine, col: curCol } = getLineCol(tv, cursorPosRef.current);
        const cursorX = worldX + ctx.measureText(lines[curLine].slice(0, curCol)).width;
        const cursorY = worldY + curLine * lineH;
        ctx.fillRect(cursorX, cursorY - fs * 0.85, 2 / zoom, fs * 1.1);
      }
      const underW = ctx.measureText((lines[0] || " ") + "  ").width;
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(worldX, worldY + 5);
      ctx.lineTo(worldX + underW, worldY + 5);
      ctx.stroke();
      ctx.restore();
    }

    // Selection bounding box (combined bounds of all selected elements)
    const selIds = selectedIdsRef.current;
    if (selIds.length > 0 && toolRef.current === "select") {
      const dragOff = ds?.active ? { dx: ds.currentX - ds.startX, dy: ds.currentY - ds.startY } : { dx: 0, dy: 0 };
      let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
      for (const id of selIds) {
        let el = elementsRef.current.find((e) => e.id === id);
        if (!el) continue;
        if (ds?.active) el = translateElement(el, dragOff.dx, dragOff.dy);
        const b = getBounds(el);
        bMinX = Math.min(bMinX, b.x);
        bMinY = Math.min(bMinY, b.y);
        bMaxX = Math.max(bMaxX, b.x + b.w);
        bMaxY = Math.max(bMaxY, b.y + b.h);
      }
      if (bMinX !== Infinity) {
        ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
        ctx.save();
        ctx.strokeStyle = "#6366f1";
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([6 / zoom, 3 / zoom]);
        ctx.strokeRect(bMinX - 6, bMinY - 6, bMaxX - bMinX + 12, bMaxY - bMinY + 12);
        ctx.restore();
      }
    }

    // Marquee selection rectangle
    const mq = marqueeRef.current;
    if (mq?.active) {
      const minX = Math.min(mq.startX, mq.currentX);
      const minY = Math.min(mq.startY, mq.currentY);
      const mw = Math.abs(mq.currentX - mq.startX);
      const mh = Math.abs(mq.currentY - mq.startY);
      ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
      ctx.save();
      ctx.fillStyle = "#6366f133";
      ctx.fillRect(minX, minY, mw, mh);
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 3 / zoom]);
      ctx.strokeRect(minX, minY, mw, mh);
      ctx.restore();
    }

    // Eraser circle (screen space)
    if (toolRef.current === "eraser" && mousePosRef.current) {
      const pos = drawingRef.current.active
        ? drawingRef.current.points[drawingRef.current.points.length - 1]
        : mousePosRef.current;
      if (pos) {
        const sx = pos.x * zoom + panX;
        const sy = pos.y * zoom + panY;
        const sr = strokeWidthRef.current * 5 * zoom;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.save();
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
      }
    }

    // Remote cursor (screen space)
    if (remoteCursor) {
      const sx = remoteCursor.x * zoom + panX;
      const sy = remoteCursor.y * zoom + panY;
      const rc = PLAYER_COLORS[1 - playerIndexRef.current] ?? PLAYER_COLORS[1];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
      if (remoteCursor.isLaser) {
        // Draw remote laser trail (world space)
        const rNow = Date.now();
        const rTrail = remoteLaserTrailRef.current.filter((p) => rNow - p.t < 2000);
        remoteLaserTrailRef.current = rTrail;
        ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
        ctx.save();
        if (rTrail.length > 1) {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          for (let i = 1; i < rTrail.length; i++) {
            const age = (rNow - rTrail[i].t) / 2000;
            ctx.globalAlpha = (1 - age) * 0.85;
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(rTrail[i - 1].x, rTrail[i - 1].y);
            ctx.lineTo(rTrail[i].x, rTrail[i].y);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(remoteCursor.x, remoteCursor.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(remoteCursor.x, remoteCursor.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        ctx.fillStyle = rc;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 10, sy + 14);
        ctx.lineTo(sx + 6, sy + 14);
        ctx.lineTo(sx + 8.5, sy + 20);
        ctx.lineTo(sx + 6.5, sy + 20.5);
        ctx.lineTo(sx + 4, sy + 14.5);
        ctx.lineTo(sx, sy + 17);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // Edge indicator when remote cursor is off-screen
      edgeIndicatorRef.current = null;
      const W = canvas.width, H = canvas.height;
      const isx = remoteCursor.x * zoom + panX;
      const isy = remoteCursor.y * zoom + panY;
      if (isx < 0 || isx > W || isy < 0 || isy > H) {
        const MARGIN = 32;
        const cx = W / 2, cy = H / 2;
        const dx = isx - cx, dy = isy - cy;
        const tx = Math.abs(dx) > 0 ? (cx - MARGIN) / Math.abs(dx) : Infinity;
        const ty = Math.abs(dy) > 0 ? (cy - MARGIN) / Math.abs(dy) : Infinity;
        const t = Math.min(tx, ty);
        const ex = cx + dx * t, ey = cy + dy * t;
        edgeIndicatorRef.current = { x: ex, y: ey };
        const angle = Math.atan2(dy, dx);
        const rc = PLAYER_COLORS[1 - playerIndexRef.current] ?? PLAYER_COLORS[1];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.save();
        // Glow ring
        ctx.beginPath();
        ctx.arc(ex, ey, 18, 0, Math.PI * 2);
        ctx.fillStyle = rc + "40";
        ctx.fill();
        // Filled circle
        ctx.beginPath();
        ctx.arc(ex, ey, 13, 0, Math.PI * 2);
        ctx.fillStyle = rc;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Arrow pointing toward partner
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(angle);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-4, -4.5);
        ctx.lineTo(-4, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.restore();
      }
    }

    // Local laser trail (world space)
    const now = Date.now();
    const trail = laserTrailRef.current.filter((p) => now - p.t < 2000);
    laserTrailRef.current = trail;
    if (toolRef.current === "laser") {
      ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
      ctx.save();
      if (trail.length > 1) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let i = 1; i < trail.length; i++) {
          const age = (now - trail[i].t) / 2000;
          ctx.globalAlpha = (1 - age) * 0.85;
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
      }
      // Dot: follow mouse immediately; trail tip only while actively drawing
      const dotPos = drawingRef.current.active && trail.length > 0
        ? trail[trail.length - 1]
        : mousePosRef.current;
      if (dotPos) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(dotPos.x, dotPos.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(dotPos.x, dotPos.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Resize + rotation handles for single selected element (select tool)
    if (selIds.length === 1 && toolRef.current === "select" && !ds?.active) {
      const el = elementsRef.current.find((e) => e.id === selIds[0]);
      if (el) {
        ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
        const b = getBounds(el);
        const mx = b.x + b.w / 2;
        const my = b.y + b.h / 2;
        const hw = b.w / 2 + 6, hh = b.h / 2 + 6;
        const corners = [
          { x: mx - hw, y: my - hh, handle: "nw" },
          { x: mx + hw, y: my - hh, handle: "ne" },
          { x: mx + hw, y: my + hh, handle: "se" },
          { x: mx - hw, y: my + hh, handle: "sw" },
        ];
        const HR = 6 / zoom;
        ctx.save();
        corners.forEach(({ x, y }) => {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#6366f1";
          ctx.lineWidth = 2 / zoom;
          ctx.beginPath();
          ctx.rect(x - HR, y - HR, HR * 2, HR * 2);
          ctx.fill(); ctx.stroke();
        });
        // Rotation handle
        const rotY = my - hh - 24 / zoom;
        ctx.setLineDash([3 / zoom, 3 / zoom]);
        ctx.strokeStyle = "#6366f180";
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath(); ctx.moveTo(mx, my - hh - 6 / zoom); ctx.lineTo(mx, rotY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#6366f1";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.arc(mx, rotY, HR, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
  }, [remotePreview, remoteCursor]);

  // RAF loop (also drives smooth pan-to-partner animation)
  useEffect(() => {
    const loop = () => {
      if (panTargetRef.current) {
        const { panX, panY, zoom } = viewRef.current;
        const dx = panTargetRef.current.panX - panX;
        const dy = panTargetRef.current.panY - panY;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          viewRef.current = { panX: panTargetRef.current.panX, panY: panTargetRef.current.panY, zoom };
          panTargetRef.current = null;
        } else {
          viewRef.current = { panX: panX + dx * 0.14, panY: panY + dy * 0.14, zoom };
        }
        setZoomDisplay(Math.round(zoom * 100));
      }
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // ── Zoom helpers ──────────────────────────────────────────────────────────────

  const applyZoom = useCallback((factor: number, originX?: number, originY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { panX, panY, zoom } = viewRef.current;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    const cx = originX ?? canvas.width / 2;
    const cy = originY ?? canvas.height / 2;
    const worldX = (cx - panX) / zoom;
    const worldY = (cy - panY) / zoom;
    viewRef.current = { panX: cx - worldX * newZoom, panY: cy - worldY * newZoom, zoom: newZoom };
    setZoomDisplay(Math.round(newZoom * 100));
  }, []);

  const resetView = useCallback(() => {
    viewRef.current = { panX: 0, panY: 0, zoom: 1 };
    setZoomDisplay(100);
  }, []);

  // ── Wheel ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (e.ctrlKey) {
        applyZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, mx, my);
      } else {
        const { panX, panY, zoom } = viewRef.current;
        viewRef.current = { panX: panX - e.deltaX, panY: panY - e.deltaY, zoom };
      }
    };
    wrapper.addEventListener("wheel", onWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  // ── Space key ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (textActiveRef.current) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        spaceDownRef.current = true;
        if (!isPanningRef.current) setCursorOverride("grab");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        if (!isPanningRef.current) setCursorOverride(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  // ── Text keyboard capture ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!textInput) return;
    const commitCurrentText = () => {
      const ti = textInputPosRef.current;
      const tv = textValueRef.current.trim();
      if (ti && tv) {
        const el = {
          id: uuidv4(), type: "text",
          x: ti.worldX, y: ti.worldY,
          text: tv, color: colorRef.current,
          fontSize: fontSizeRef.current, playerIndex: playerIndexRef.current,
        } as TextElement;
        pushUndo({ added: [el], removed: [] });
        onElementComplete(el);
      }
      setTextInput(null);
      setTextValue("");
      textValueRef.current = "";
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const text = textValueRef.current;
      const pos = cursorPosRef.current;
      const hasSelection = selectionStartRef.current !== null && selectionStartRef.current !== pos;

      if (e.key === "Escape") {
        e.preventDefault();
        commitCurrentText();
        cursorPosRef.current = 0;
        selectionStartRef.current = null;
      } else if (mod && e.key === "a") {
        e.preventDefault();
        selectionStartRef.current = 0;
        cursorPosRef.current = text.length;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newPos = Math.max(0, pos - 1);
        if (e.shiftKey) {
          if (selectionStartRef.current === null) selectionStartRef.current = pos;
          cursorPosRef.current = newPos;
        } else {
          cursorPosRef.current = newPos;
          selectionStartRef.current = null;
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const newPos = Math.min(text.length, pos + 1);
        if (e.shiftKey) {
          if (selectionStartRef.current === null) selectionStartRef.current = pos;
          cursorPosRef.current = newPos;
        } else {
          cursorPosRef.current = newPos;
          selectionStartRef.current = null;
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const newPos = moveCursorVertical(text, pos, -1);
        if (e.shiftKey) {
          if (selectionStartRef.current === null) selectionStartRef.current = pos;
          cursorPosRef.current = newPos;
        } else {
          cursorPosRef.current = newPos;
          selectionStartRef.current = null;
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const newPos = moveCursorVertical(text, pos, 1);
        if (e.shiftKey) {
          if (selectionStartRef.current === null) selectionStartRef.current = pos;
          cursorPosRef.current = newPos;
        } else {
          cursorPosRef.current = newPos;
          selectionStartRef.current = null;
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        const { line, col } = getLineCol(text, pos);
        const lines = text.split("\n");
        let lineStart = 0;
        for (let i = 0; i < line; i++) lineStart += lines[i].length + 1;
        if (e.shiftKey) {
          if (selectionStartRef.current === null) selectionStartRef.current = pos;
          cursorPosRef.current = lineStart;
        } else {
          cursorPosRef.current = lineStart;
          selectionStartRef.current = null;
        }
      } else if (e.key === "End") {
        e.preventDefault();
        const { line } = getLineCol(text, pos);
        const lines = text.split("\n");
        let lineStart = 0;
        for (let i = 0; i < line; i++) lineStart += lines[i].length + 1;
        const lineEnd = lineStart + lines[line].length;
        if (e.shiftKey) {
          if (selectionStartRef.current === null) selectionStartRef.current = pos;
          cursorPosRef.current = lineEnd;
        } else {
          cursorPosRef.current = lineEnd;
          selectionStartRef.current = null;
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        let newText: string;
        if (hasSelection) {
          const start = Math.min(selectionStartRef.current!, pos);
          const end = Math.max(selectionStartRef.current!, pos);
          newText = text.slice(0, start) + "\n" + text.slice(end);
          cursorPosRef.current = start + 1;
        } else {
          newText = text.slice(0, pos) + "\n" + text.slice(pos);
          cursorPosRef.current = pos + 1;
        }
        setTextValue(newText);
        textValueRef.current = newText;
        selectionStartRef.current = null;
      } else if (e.key === "Backspace") {
        e.preventDefault();
        let newText: string;
        if (hasSelection) {
          const start = Math.min(selectionStartRef.current!, pos);
          const end = Math.max(selectionStartRef.current!, pos);
          newText = text.slice(0, start) + text.slice(end);
          cursorPosRef.current = start;
        } else {
          if (pos === 0) return;
          newText = text.slice(0, pos - 1) + text.slice(pos);
          cursorPosRef.current = pos - 1;
        }
        setTextValue(newText);
        textValueRef.current = newText;
        selectionStartRef.current = null;
      } else if (e.key === "Delete") {
        e.preventDefault();
        let newText: string;
        if (hasSelection) {
          const start = Math.min(selectionStartRef.current!, pos);
          const end = Math.max(selectionStartRef.current!, pos);
          newText = text.slice(0, start) + text.slice(end);
          cursorPosRef.current = start;
        } else {
          if (pos >= text.length) return;
          newText = text.slice(0, pos) + text.slice(pos + 1);
        }
        setTextValue(newText);
        textValueRef.current = newText;
        selectionStartRef.current = null;
      } else if (e.key.length === 1 && !mod && !e.altKey) {
        e.preventDefault();
        let newText: string;
        if (hasSelection) {
          const start = Math.min(selectionStartRef.current!, pos);
          const end = Math.max(selectionStartRef.current!, pos);
          newText = text.slice(0, start) + e.key + text.slice(end);
          cursorPosRef.current = start + 1;
        } else {
          newText = text.slice(0, pos) + e.key + text.slice(pos);
          cursorPosRef.current = pos + 1;
        }
        setTextValue(newText);
        textValueRef.current = newText;
        selectionStartRef.current = null;
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      const curPos = cursorPosRef.current;
      const selStart = selectionStartRef.current;
      if (selStart === null || selStart === curPos) return;
      e.preventDefault();
      const start = Math.min(selStart, curPos);
      const end = Math.max(selStart, curPos);
      e.clipboardData?.setData("text/plain", textValueRef.current.slice(start, end));
    };

    const onCut = (e: ClipboardEvent) => {
      const curPos = cursorPosRef.current;
      const selStart = selectionStartRef.current;
      if (selStart === null || selStart === curPos) return;
      e.preventDefault();
      const start = Math.min(selStart, curPos);
      const end = Math.max(selStart, curPos);
      e.clipboardData?.setData("text/plain", textValueRef.current.slice(start, end));
      const newText = textValueRef.current.slice(0, start) + textValueRef.current.slice(end);
      setTextValue(newText);
      textValueRef.current = newText;
      cursorPosRef.current = start;
      selectionStartRef.current = null;
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const pastedText = e.clipboardData?.getData("text/plain") ?? "";
      if (!pastedText) return;
      const curPos = cursorPosRef.current;
      const selStart = selectionStartRef.current;
      const hasSelection = selStart !== null && selStart !== curPos;
      let newText: string;
      if (hasSelection) {
        const start = Math.min(selStart!, curPos);
        const end = Math.max(selStart!, curPos);
        newText = textValueRef.current.slice(0, start) + pastedText + textValueRef.current.slice(end);
        cursorPosRef.current = start + pastedText.length;
      } else {
        newText = textValueRef.current.slice(0, curPos) + pastedText + textValueRef.current.slice(curPos);
        cursorPosRef.current = curPos + pastedText.length;
      }
      setTextValue(newText);
      textValueRef.current = newText;
      selectionStartRef.current = null;
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCut);
      window.removeEventListener("paste", onPaste);
    };
  }, [textInput, onElementComplete]);

  // ── Window-level pan tracking ─────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const { screenX, screenY, panX, panY } = panStartRef.current;
      viewRef.current = { ...viewRef.current, panX: panX + (e.clientX - screenX), panY: panY + (e.clientY - screenY) };
    };
    const onUp = () => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      setCursorOverride(spaceDownRef.current ? "grab" : null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ── Undo / Redo ───────────────────────────────────────────────────────────────

  const handleLocalUndo = useCallback(() => {
    const action = undoStackRef.current.pop();
    if (!action) return;
    redoStackRef.current.push(action);
    if (action.added.length > 0) onErase(action.added.map((el) => el.id));
    for (const el of action.removed) onElementComplete(el);
  }, [onErase, onElementComplete]);

  const handleLocalRedo = useCallback(() => {
    const action = redoStackRef.current.pop();
    if (!action) return;
    undoStackRef.current.push(action);
    if (action.removed.length > 0) onErase(action.removed.map((el) => el.id));
    for (const el of action.added) onElementComplete(el);
  }, [onErase, onElementComplete]);

  const pushUndo = useCallback((action: { added: DrawElement[]; removed: DrawElement[] }) => {
    undoStackRef.current.push(action);
    redoStackRef.current = [];
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textInput) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleLocalUndo(); return; }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); handleLocalRedo(); return; }
      if (mod && e.key === "c") {
        e.preventDefault();
        if (selectedIdsRef.current.length > 0)
          clipboardRef.current = elementsRef.current.filter((el) => selectedIdsRef.current.includes(el.id));
        return;
      }
      if (mod && e.key === "v") {
        e.preventDefault();
        if (clipboardRef.current.length > 0) {
          const offsetPasted = clipboardRef.current.map((el) =>
            translateElement({ ...el, id: uuidv4(), playerIndex: playerIndexRef.current }, 20, 20)
          );
          pushUndo({ added: offsetPasted, removed: [] });
          offsetPasted.forEach((el) => onElementComplete(el));
          setSelectedIds(offsetPasted.map((el) => el.id));
          selectedIdsRef.current = offsetPasted.map((el) => el.id);
        }
        return;
      }
      if (mod && e.key === "d") {
        e.preventDefault();
        if (selectedIdsRef.current.length > 0) {
          const duped = elementsRef.current
            .filter((el) => selectedIdsRef.current.includes(el.id))
            .map((el) => translateElement({ ...el, id: uuidv4(), playerIndex: playerIndexRef.current }, 20, 20));
          pushUndo({ added: duped, removed: [] });
          duped.forEach((el) => onElementComplete(el));
          setSelectedIds(duped.map((el) => el.id));
          selectedIdsRef.current = duped.map((el) => el.id);
        }
        return;
      }
      if (!mod && !e.altKey) {
        if (e.key === "+" || e.key === "=") { e.preventDefault(); applyZoom(1.25); }
        if (e.key === "-") { e.preventDefault(); applyZoom(1 / 1.25); }
        if (e.key === "0") { e.preventDefault(); resetView(); }
        if ((e.key === "Delete" || e.key === "Backspace") && toolRef.current === "select") {
          if (selectedIdsRef.current.length > 0) {
            const toDelete = elementsRef.current.filter((el) => selectedIdsRef.current.includes(el.id));
            pushUndo({ added: [], removed: toDelete });
            onErase(selectedIdsRef.current);
            setSelectedIds([]);
            selectedIdsRef.current = [];
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [textInput, handleLocalUndo, handleLocalRedo, applyZoom, resetView, onErase, onElementComplete, pushUndo]);

  // ── Close context menu on outside click ──────────────────────────────────────

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = () => setContextMenu(null);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [contextMenu]);

  // ── Mouse handlers ────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Click on edge indicator → smooth-pan to partner
      if (edgeIndicatorRef.current && remoteCursorRef.current) {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const sx = (e.clientX - rect.left) * scaleX;
        const sy = (e.clientY - rect.top) * scaleY;
        if (Math.hypot(sx - edgeIndicatorRef.current.x, sy - edgeIndicatorRef.current.y) < 22) {
          const { zoom } = viewRef.current;
          panTargetRef.current = {
            panX: canvas.width / 2 - remoteCursorRef.current.x * zoom,
            panY: canvas.height / 2 - remoteCursorRef.current.y * zoom,
          };
          return;
        }
      }

      const isPanTrigger = e.button === 1 || (e.button === 0 && spaceDownRef.current);
      if (isPanTrigger) {
        e.preventDefault();
        isPanningRef.current = true;
        setCursorOverride("grabbing");
        panStartRef.current = { screenX: e.clientX, screenY: e.clientY, panX: viewRef.current.panX, panY: viewRef.current.panY };
        return;
      }

      const pt = toCanvas(e.clientX, e.clientY);

      // ── Select tool ───────────────────────────────────────────────────────────
      if (toolRef.current === "select") {
        setContextMenu(null);
        if (e.button !== 0) return;

        // Check resize / rotation handles for single selection
        if (selectedIdsRef.current.length === 1) {
          const selEl = elementsRef.current.find((e) => e.id === selectedIdsRef.current[0]);
          if (selEl) {
            const b = getBounds(selEl);
            const mx = b.x + b.w / 2, my = b.y + b.h / 2;
            const hw = b.w / 2 + 6, hh = b.h / 2 + 6;
            const HR = 10; // hit radius in world units (handle is 6px, plus tolerance)
            const handles = [
              { x: mx - hw, y: my - hh, handle: "nw" },
              { x: mx + hw, y: my - hh, handle: "ne" },
              { x: mx + hw, y: my + hh, handle: "se" },
              { x: mx - hw, y: my + hh, handle: "sw" },
            ];
            for (const h of handles) {
              if (Math.hypot(pt.x - h.x, pt.y - h.y) < HR / viewRef.current.zoom) {
                handleDragRef.current = { type: "resize", elementId: selEl.id, originalSnapshot: selEl, snapshot: selEl, handle: h.handle, startX: pt.x, startY: pt.y };
                return;
              }
            }
            // Rotation handle
            const rotY = my - hh - 24 / viewRef.current.zoom;
            if (Math.hypot(pt.x - mx, pt.y - rotY) < HR / viewRef.current.zoom) {
              handleDragRef.current = { type: "rotate", elementId: selEl.id, originalSnapshot: selEl, snapshot: selEl, handle: "rot", startX: pt.x, startY: pt.y };
              return;
            }
          }
        }

        const els = elementsRef.current;
        let hit: DrawElement | null = null;
        for (let i = els.length - 1; i >= 0; i--) {
          if (hitTestElement(els[i], pt.x, pt.y)) { hit = els[i]; break; }
        }

        if (hit) {
          if (e.shiftKey) {
            // Toggle element in/out of selection — no drag
            const already = selectedIdsRef.current.includes(hit.id);
            const newIds = already
              ? selectedIdsRef.current.filter((id) => id !== hit.id)
              : [...selectedIdsRef.current, hit.id];
            setSelectedIds(newIds);
            selectedIdsRef.current = newIds;
          } else {
            // If not already selected, replace selection with just this element
            if (!selectedIdsRef.current.includes(hit.id)) {
              setSelectedIds([hit.id]);
              selectedIdsRef.current = [hit.id];
            }
            // Start drag for all currently selected elements
            const snapshots = els.filter((el) => selectedIdsRef.current.includes(el.id));
            dragStateRef.current = { active: true, elementSnapshots: snapshots, startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y };
          }
        } else {
          // Empty canvas — start marquee; shift keeps existing selection
          if (!e.shiftKey) {
            setSelectedIds([]);
            selectedIdsRef.current = [];
          }
          marqueeRef.current = { active: true, startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y };
        }
        return;
      }

      // ── Laser tool ────────────────────────────────────────────────────────────
      if (toolRef.current === "laser") {
        laserTrailRef.current = [{ x: pt.x, y: pt.y, t: Date.now() }];
        drawingRef.current = { active: true, startX: pt.x, startY: pt.y, points: [pt] };
        return;
      }

      // ── Fill tool ─────────────────────────────────────────────────────────────
      if (toolRef.current === "fill") {
        const els = elementsRef.current;
        for (let i = els.length - 1; i >= 0; i--) {
          const el = els[i];
          if (el.type === "rect" || el.type === "ellipse") {
            if (hitTestElement(el, pt.x, pt.y)) {
              const filled = { ...el, fillColor: colorRef.current };
              pushUndo({ added: [filled], removed: [el] });
              onErase([el.id]);
              onElementComplete(filled);
              break;
            }
          } else if (el.type === "stroke") {
            if (pointInPath(el.points, pt.x, pt.y)) {
              const filled = { ...el, fillColor: colorRef.current };
              pushUndo({ added: [filled], removed: [el] });
              onErase([el.id]);
              onElementComplete(filled);
              break;
            }
          } else if (el.type === "image") {
            if (hitTestElement(el, pt.x, pt.y)) {
              const newFills = [...(el.fills ?? []), { wx: pt.x, wy: pt.y, color: colorRef.current }];
              const filled = { ...el, fills: newFills };
              pushUndo({ added: [filled], removed: [el] });
              onErase([el.id]);
              onElementComplete(filled);
              break;
            }
          }
        }
        return;
      }

      // ── Text tool click-to-reposition cursor ──────────────────────────────────
      if (textInput) {
        const ti = textInputPosRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (ti && ctx) {
          const fs = fontSizeRef.current;
          ctx.font = `${fs}px sans-serif`;
          const tv = textValueRef.current;
          const lines = tv.split("\n");
          const lineH = fs * 1.3;
          const lineIdx = Math.max(0, Math.min(lines.length - 1, Math.floor((pt.y - ti.worldY + fs) / lineH)));
          const charInLine = findCharInLine(ctx, lines[lineIdx], pt.x - ti.worldX);
          let absPos = 0;
          for (let i = 0; i < lineIdx; i++) absPos += lines[i].length + 1;
          cursorPosRef.current = absPos + charInLine;
          selectionStartRef.current = null;
          textDragRef.current = true;
        }
        return;
      }

      drawingRef.current = { active: true, startX: pt.x, startY: pt.y, points: [pt] };

      if (toolRef.current === "text") {
        drawingRef.current.active = false;
        const existing = elementsRef.current.find(
          (el): el is TextElement => el.type === "text" && hitTestText(el, pt.x, pt.y)
        );
        if (existing) {
          onErase([existing.id]);
          setTextInput({ worldX: existing.x, worldY: existing.y });
          setTextValue(existing.text);
          textValueRef.current = existing.text;
          cursorPosRef.current = existing.text.length;
        } else {
          setTextInput({ worldX: pt.x, worldY: pt.y });
          setTextValue("");
          textValueRef.current = "";
          cursorPosRef.current = 0;
        }
      }
    },
    [textInput, toCanvas, onErase]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) return;

      const pt = toCanvas(e.clientX, e.clientY);
      const now = Date.now();
      const isLaserTool = toolRef.current === "laser";
      if (now - lastSocketSendRef.current > 33) {
        onCursorMove(pt.x, pt.y, isLaserTool, isLaserTool && drawingRef.current.active);
        lastSocketSendRef.current = now;
      }
      mousePosRef.current = pt;

      // Text selection drag
      if (textDragRef.current && textActiveRef.current) {
        const ti = textInputPosRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (ti && ctx) {
          const fs = fontSizeRef.current;
          ctx.font = `${fs}px sans-serif`;
          const tv = textValueRef.current;
          const lines = tv.split("\n");
          const lineH = fs * 1.3;
          const lineIdx = Math.max(0, Math.min(lines.length - 1, Math.floor((pt.y - ti.worldY + fs) / lineH)));
          const charInLine = findCharInLine(ctx, lines[lineIdx], pt.x - ti.worldX);
          let absPos = 0;
          for (let i = 0; i < lineIdx; i++) absPos += lines[i].length + 1;
          const newPos = absPos + charInLine;

          if (selectionStartRef.current === null) {
            selectionStartRef.current = cursorPosRef.current;
          }
          cursorPosRef.current = newPos;
        }
        return;
      }

      // Handle drag (resize/rotate)
      if (handleDragRef.current) {
        const hd = handleDragRef.current;
        if (hd.type === "rotate") {
          // Always rotate from the original snapshot to avoid drift
          const orig = hd.originalSnapshot;
          const b = getBounds(orig);
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          let angle = Math.atan2(pt.y - cy, pt.x - cx) + Math.PI / 2;
          if (e.shiftKey) {
            const step = Math.PI / 4;
            angle = Math.round(angle / step) * step;
          }
          const updated = rotateCoords(orig, angle);
          onMoveElements([updated]);
          hd.snapshot = updated;
          return;
        } else if (hd.type === "resize") {
          const snap = hd.snapshot;
          const handle = hd.handle;
          const b = getBounds(snap);
          let { x: nx, y: ny, w: nw, h: nh } = b;
          if (handle === "se") { nw = Math.max(10, pt.x - nx); nh = Math.max(10, pt.y - ny); }
          else if (handle === "sw") { nw = Math.max(10, (b.x + b.w) - pt.x); nx = pt.x; nh = Math.max(10, pt.y - ny); }
          else if (handle === "ne") { nw = Math.max(10, pt.x - nx); nh = Math.max(10, (b.y + b.h) - pt.y); ny = pt.y; }
          else if (handle === "nw") { nw = Math.max(10, (b.x + b.w) - pt.x); nx = pt.x; nh = Math.max(10, (b.y + b.h) - pt.y); ny = pt.y; }
          if (e.shiftKey && b.w > 0 && b.h > 0) {
            const ar = b.w / b.h;
            if (nw / nh > ar) { nw = nh * ar; } else { nh = nw / ar; }
            if (handle === "nw") { nx = b.x + b.w - nw; ny = b.y + b.h - nh; }
            else if (handle === "ne") { ny = b.y + b.h - nh; }
            else if (handle === "sw") { nx = b.x + b.w - nw; }
          }
          const updated = scaleElement(snap, b, { x: nx, y: ny, w: nw, h: nh });
          onMoveElements([updated]);
          hd.snapshot = updated;
          return;
        }
      }

      // Select tool: update drag or marquee
      if (toolRef.current === "select") {
        if (dragStateRef.current?.active) {
          dragStateRef.current.currentX = pt.x;
          dragStateRef.current.currentY = pt.y;
        } else if (marqueeRef.current?.active) {
          marqueeRef.current.currentX = pt.x;
          marqueeRef.current.currentY = pt.y;
        }
        return;
      }

      // Laser tool: add to trail
      if (toolRef.current === "laser" && drawingRef.current.active) {
        laserTrailRef.current.push({ x: pt.x, y: pt.y, t: now });
        return;
      }

      if (!drawingRef.current.active) return;
      const { startX, startY } = drawingRef.current;
      const t = toolRef.current;
      const c = colorRef.current;
      const w = strokeWidthRef.current;
      const f = filledRef.current;

      // Shift-constrain helpers
      const dx = pt.x - startX, dy = pt.y - startY;
      const constrained = e.shiftKey;

      if (t === "pen") {
        drawingRef.current.points.push(pt);
        previewRef.current = { type: "stroke", points: [...drawingRef.current.points], color: c, width: w };
        if (now - lastSocketSendRef.current > 33) { onPreviewUpdate({ type: "stroke", points: [...drawingRef.current.points], color: c, width: w }); lastSocketSendRef.current = now; }
      } else if (t === "eraser") {
        drawingRef.current.points.push(pt);
        eraserRef.current = [...drawingRef.current.points];
      } else if (t === "rect") {
        let pw = Math.abs(dx), ph = Math.abs(dy);
        if (constrained) { const s = Math.max(pw, ph); pw = s; ph = s; }
        const x = startX + (dx < 0 ? -pw : 0);
        const y = startY + (dy < 0 ? -ph : 0);
        previewRef.current = { type: "rect", x, y, w: pw, h: ph, color: c, width: w, filled: f };
        if (now - lastSocketSendRef.current > 33) { onPreviewUpdate({ type: "rect", x, y, w: pw, h: ph, color: c, width: w }); lastSocketSendRef.current = now; }
      } else if (t === "ellipse") {
        let rx = Math.abs(dx) / 2, ry = Math.abs(dy) / 2;
        if (constrained) { const r = Math.max(rx, ry); rx = r; ry = r; }
        const cx = startX + dx / 2, cy = startY + dy / 2;
        previewRef.current = { type: "ellipse", cx, cy, rx, ry, color: c, width: w, filled: f };
        if (now - lastSocketSendRef.current > 33) { onPreviewUpdate({ type: "ellipse", cx, cy, rx, ry, color: c, width: w }); lastSocketSendRef.current = now; }
      } else if (t === "line" || t === "arrow") {
        let ex = pt.x, ey = pt.y;
        if (constrained) {
          const angle = Math.atan2(dy, dx);
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          ex = startX + dist * Math.cos(snapped);
          ey = startY + dist * Math.sin(snapped);
        }
        previewRef.current = { type: t, x1: startX, y1: startY, x2: ex, y2: ey, color: c, width: w };
        if (now - lastSocketSendRef.current > 33) { onPreviewUpdate({ type: t, x1: startX, y1: startY, x2: ex, y2: ey, color: c, width: w }); lastSocketSendRef.current = now; }
      }
    },
    [toCanvas, onCursorMove, onPreviewUpdate, onErase, onElementComplete, onMoveElements]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) return;

      // End text selection drag
      textDragRef.current = false;

      // Commit resize/rotate handle drag — record one undo entry
      if (handleDragRef.current) {
        const hd = handleDragRef.current;
        pushUndo({ added: [hd.snapshot], removed: [hd.originalSnapshot] });
        handleDragRef.current = null;
        return;
      }

      // Select tool: commit drag or marquee
      if (toolRef.current === "select") {
        const ds = dragStateRef.current;
        if (ds?.active) {
          const pt = toCanvas(e.clientX, e.clientY);
          const dx = pt.x - ds.startX;
          const dy = pt.y - ds.startY;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            const movedIds = ds.elementSnapshots.map((snap) => snap.id);
            const movedElements = ds.elementSnapshots.map((snap) => translateElement(snap, dx, dy));
            pushUndo({ added: movedElements, removed: ds.elementSnapshots });
            onMoveElements(movedElements);
            setSelectedIds(movedIds);
            selectedIdsRef.current = movedIds;
          }
          dragStateRef.current = null;
        }

        const mq = marqueeRef.current;
        if (mq?.active) {
          const minX = Math.min(mq.startX, mq.currentX);
          const minY = Math.min(mq.startY, mq.currentY);
          const maxX = Math.max(mq.startX, mq.currentX);
          const maxY = Math.max(mq.startY, mq.currentY);
          if (maxX - minX > 4 || maxY - minY > 4) {
            const inRect = elementsRef.current.filter((el) => elementInRect(el, minX, minY, maxX, maxY));
            const newIds = e.shiftKey
              ? [...new Set([...selectedIdsRef.current, ...inRect.map((el) => el.id)])]
              : inRect.map((el) => el.id);
            setSelectedIds(newIds);
            selectedIdsRef.current = newIds;
          }
          marqueeRef.current = null;
        }
        return;
      }

      // Laser: just stop drawing (trail fades naturally)
      if (toolRef.current === "laser") {
        drawingRef.current.active = false;
        return;
      }

      if (!drawingRef.current.active) return;
      drawingRef.current.active = false;
      previewRef.current = null;
      onPreviewUpdate(null);

      const pt = toCanvas(e.clientX, e.clientY);
      const { startX, startY, points } = drawingRef.current;
      const t = toolRef.current;
      const c = colorRef.current;
      const w = strokeWidthRef.current;
      const f = filledRef.current;
      const pi = playerIndexRef.current;
      const shift = e.shiftKey;
      const dx = pt.x - startX, dy = pt.y - startY;

      if (t === "pen") {
        if (points.length < 2) return;
        const el = { id: uuidv4(), type: "stroke", points, color: c, width: w, playerIndex: pi } as StrokeElement;
        pushUndo({ added: [el], removed: [] });
        onElementComplete(el);
      } else if (t === "eraser") {
        const ep = [...eraserRef.current];
        eraserRef.current = [];
        if (ep.length === 0) return;
        const hits = elementsRef.current.filter((el) => elementHitByEraser(el, ep, w * 5));
        if (hits.length > 0) {
          pushUndo({ added: [], removed: hits });
          onErase(hits.map((el) => el.id));
        }
      } else if (t === "rect") {
        let rw = Math.abs(dx), rh = Math.abs(dy);
        if (shift) { const s = Math.max(rw, rh); rw = s; rh = s; }
        if (rw < 5 || rh < 5) return;
        const rx = startX + (dx < 0 ? -rw : 0);
        const ry = startY + (dy < 0 ? -rh : 0);
        const el = { id: uuidv4(), type: "rect", x: rx, y: ry, w: rw, h: rh, color: c, width: w, filled: f, playerIndex: pi } as RectElement;
        pushUndo({ added: [el], removed: [] });
        onElementComplete(el);
      } else if (t === "ellipse") {
        let rx = Math.abs(dx) / 2, ry = Math.abs(dy) / 2;
        if (shift) { const r = Math.max(rx, ry); rx = r; ry = r; }
        if (rx < 5 || ry < 5) return;
        const el = { id: uuidv4(), type: "ellipse", cx: startX + dx / 2, cy: startY + dy / 2, rx, ry, color: c, width: w, filled: f, playerIndex: pi } as EllipseElement;
        pushUndo({ added: [el], removed: [] });
        onElementComplete(el);
      } else if (t === "line") {
        let ex = pt.x, ey = pt.y;
        if (shift) {
          const angle = Math.atan2(dy, dx);
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          ex = startX + dist * Math.cos(snapped);
          ey = startY + dist * Math.sin(snapped);
        }
        if (Math.hypot(ex - startX, ey - startY) < 5) return;
        const el = { id: uuidv4(), type: "line", x1: startX, y1: startY, x2: ex, y2: ey, color: c, width: w, playerIndex: pi } as LineElement;
        pushUndo({ added: [el], removed: [] });
        onElementComplete(el);
      } else if (t === "arrow") {
        let ex = pt.x, ey = pt.y;
        if (shift) {
          const angle = Math.atan2(dy, dx);
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          ex = startX + dist * Math.cos(snapped);
          ey = startY + dist * Math.sin(snapped);
        }
        if (Math.hypot(ex - startX, ey - startY) < 5) return;
        const el = { id: uuidv4(), type: "arrow", x1: startX, y1: startY, x2: ex, y2: ey, color: c, width: w, playerIndex: pi } as ArrowElement;
        pushUndo({ added: [el], removed: [] });
        onElementComplete(el);
      }
    },
    [toCanvas, onElementComplete, onPreviewUpdate, onErase, onMoveElements, pushUndo]
  );

  const handleMouseLeave = useCallback(() => {
    mousePosRef.current = null;
    handleDragRef.current = null;
    if (toolRef.current === "select") {
      dragStateRef.current = null;
      marqueeRef.current = null;
      return;
    }
    if (drawingRef.current.active) {
      drawingRef.current.active = false;
      previewRef.current = null;
      onPreviewUpdate(null);
      eraserRef.current = [];
    }
  }, [onPreviewUpdate]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (toolRef.current !== "select") return;
      const pt = toCanvas(e.clientX, e.clientY);
      const els = elementsRef.current;
      for (let i = els.length - 1; i >= 0; i--) {
        if (hitTestElement(els[i], pt.x, pt.y)) {
          // If the hit element is already in the selection, use the full selection;
          // otherwise select just this element.
          const hitId = els[i].id;
          const ids = selectedIdsRef.current.includes(hitId)
            ? selectedIdsRef.current
            : [hitId];
          if (!selectedIdsRef.current.includes(hitId)) {
            setSelectedIds([hitId]);
            selectedIdsRef.current = [hitId];
          }
          setContextMenu({ x: e.clientX, y: e.clientY, elementIds: ids });
          return;
        }
      }
      setContextMenu(null);
    },
    [toCanvas]
  );

  // ── Tool change (commits active text first) ───────────────────────────────────

  const handleToolChange = useCallback((t: ToolType) => {
    if (textActiveRef.current) {
      const ti = textInputPosRef.current;
      const tv = textValueRef.current.trim();
      if (ti && tv) {
        const el = {
          id: uuidv4(), type: "text",
          x: ti.worldX, y: ti.worldY,
          text: tv, color: colorRef.current,
          fontSize: fontSizeRef.current, playerIndex: playerIndexRef.current,
        } as TextElement;
        pushUndo({ added: [el], removed: [] });
        onElementComplete(el);
      }
      setTextInput(null);
      setTextValue("");
      textValueRef.current = "";
    }
    if (t !== "select") {
      setSelectedIds([]);
      selectedIdsRef.current = [];
      dragStateRef.current = null;
      marqueeRef.current = null;
    }
    setContextMenu(null);
    setTool(t);
  }, [onElementComplete]);

  // ── Place coloring page centered in current viewport ─────────────────────────

  const placeColoringPage = useCallback((page: ColoringPage, aspectRatio?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { panX, panY, zoom } = viewRef.current;
    const cx = (canvas.width / 2 - panX) / zoom;
    const cy = (canvas.height / 2 - panY) / zoom;

    // Fit within 60% of the visible viewport, preserving aspect ratio
    const maxW = (canvas.width * 0.6) / zoom;
    const maxH = (canvas.height * 0.6) / zoom;
    let w: number, h: number;
    if (aspectRatio && aspectRatio > 0) {
      if (aspectRatio >= 1) {
        w = maxW; h = w / aspectRatio;
        if (h > maxH) { h = maxH; w = h * aspectRatio; }
      } else {
        h = maxH; w = h * aspectRatio;
        if (w > maxW) { w = maxW; h = w / aspectRatio; }
      }
    } else {
      w = Math.min(maxW, maxH);
      h = w;
    }

    const el = {
      id: uuidv4(),
      type: "image",
      x: cx - w / 2,
      y: cy - h / 2,
      w,
      h,
      // Proxy URL: same-origin, stable (no expiry), allows getImageData for flood fill
      url: `/api/coloring-image?key=coloring-pages/${page.filename}`,
      name: page.name,
      playerIndex: playerIndexRef.current,
    } as ImageElement;
    pushUndo({ added: [el], removed: [] });
    onElementComplete(el);
  }, [onElementComplete]);

  // ── Cursor style ──────────────────────────────────────────────────────────────

  const cursorStyle = cursorOverride ?? (
    tool === "select" ? "default" :
    tool === "text" ? "text" :
    tool === "eraser" ? "none" :
    tool === "fill" ? "cell" :
    tool === "laser" ? "none" :
    "crosshair"
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full bg-gray-100 select-none">

      {/* ── Top toolbar ────────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-1.5">
        {(Object.keys(TOOL_LABELS) as ToolType[]).map((t) => (
          <button
            key={t}
            title={TOOL_LABELS[t]}
            onClick={() => handleToolChange(t)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition
              ${tool === t ? "bg-indigo-100 text-indigo-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
          >
            {TOOL_ICONS[t]}
          </button>
        ))}

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <button
          title="Undo (Ctrl+Z)"
          onClick={handleLocalUndo}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          title="Redo (Ctrl+Y)"
          onClick={handleLocalRedo}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <button
          title="Coloring Pages"
          onClick={() => setShowColoringPanel((v) => !v)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition
            ${showColoringPanel ? "bg-indigo-100 text-indigo-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
      </div>

      {/* ── Left panel: colors + thickness ─────────────────────────────────────── */}
      {tool !== "eraser" && tool !== "select" && tool !== "laser" && (
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-3">
        {STROKE_WIDTHS.map((w, i) => (
          <button
            key={w}
            title={`Size ${i + 1}`}
            onClick={() => setStrokeWidth(w)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition
              ${strokeWidth === w ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-gray-100"}`}
          >
            <div
              className="rounded-full"
              style={{ width: [5, 9, 15][i], height: [5, 9, 15][i], background: color === "#ffffff" ? "#94a3b8" : color }}
            />
          </button>
        ))}

        <div className="w-5 h-px bg-gray-200" />

        {COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => setColor(c)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition hover:scale-110
              ${color === c ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
          >
            <div className="w-5 h-5 rounded-full border border-gray-300" style={{ background: c }} />
          </button>
        ))}

        {/* Custom color picker */}
        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-gray-300 hover:ring-1 hover:ring-indigo-400 transition" title="Custom color">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
          <div className="w-full h-full flex items-center justify-center pointer-events-none" style={{ background: color }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={color === "#ffffff" ? "#94a3b8" : "#ffffff"} strokeWidth={2} strokeLinecap="round" className="w-3.5 h-3.5">
              <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
            </svg>
          </div>
        </div>

        {/* Font size (visible only when text tool is active) */}
        {tool === "text" && (
          <>
            <div className="w-5 h-px bg-gray-200" />
            {FONT_SIZES.map((fs) => (
              <button
                key={fs}
                title={`Font size ${fs}`}
                onClick={() => setFontSize(fs)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition
                  ${fontSize === fs ? "bg-indigo-50 ring-1 ring-indigo-300 text-indigo-600" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {fs}
              </button>
            ))}
          </>
        )}
      </div>
      )}

      {/* ── Zoom controls ──────────────────────────────────────────────────────── */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-1.5">
        <button title="Zoom out (-)" onClick={() => applyZoom(1 / 1.25)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition font-bold text-base">−</button>
        <button title="Reset zoom (0)" onClick={resetView} className="px-2 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition text-xs font-mono">{zoomDisplay}%</button>
        <button title="Zoom in (+)" onClick={() => applyZoom(1.25)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition font-bold text-base">+</button>
      </div>

      {/* ── Tooltip ────────────────────────────────────────────────────────────── */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <span className="text-xs text-gray-400">{TOOL_TIPS[tool]}</span>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────────────── */}
      <div ref={wrapperRef} className="absolute inset-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ cursor: cursorStyle, display: "block", width: "100%", height: "100%" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* ── Context menu ───────────────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          className="absolute z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const toDelete = elementsRef.current.filter((el) => contextMenu.elementIds.includes(el.id));
              pushUndo({ added: [], removed: toDelete });
              onErase(contextMenu.elementIds);
              setSelectedIds([]);
              selectedIdsRef.current = [];
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-t-xl"
          >
            Delete{contextMenu.elementIds.length > 1 ? ` (${contextMenu.elementIds.length})` : ""}
          </button>
          <div className="h-px bg-gray-100 my-1" />
          <button
            onClick={() => {
              const duped = elementsRef.current
                .filter((el) => contextMenu.elementIds.includes(el.id))
                .map((el) => translateElement({ ...el, id: uuidv4(), playerIndex: playerIndexRef.current }, 20, 20));
              pushUndo({ added: duped, removed: [] });
              duped.forEach((el) => onElementComplete(el));
              setSelectedIds(duped.map((el) => el.id));
              selectedIdsRef.current = duped.map((el) => el.id);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Duplicate
          </button>
          <div className="h-px bg-gray-100 my-1" />
          <button onClick={() => { contextMenu.elementIds.forEach((id) => onReorder(id, "front")); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Bring to Front</button>
          <button onClick={() => { contextMenu.elementIds.forEach((id) => onReorder(id, "forward")); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Bring Forward</button>
          <button onClick={() => { contextMenu.elementIds.forEach((id) => onReorder(id, "backward")); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Send Backward</button>
          <button onClick={() => { contextMenu.elementIds.forEach((id) => onReorder(id, "back")); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-xl">Send to Back</button>
        </div>
      )}

      {/* ── Coloring pages panel ───────────────────────────────────────────────── */}
      {showColoringPanel && (
        <div className="absolute right-3 top-14 z-20 w-60 max-h-[calc(100%-6rem)] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Coloring Pages
          </div>
          <div className="overflow-y-auto p-2 flex flex-col gap-1.5">
            {coloringPages.length === 0 ? (
              <div className="text-xs text-gray-400 px-1 py-2">No pages found.</div>
            ) : (
              coloringPages.map((page) => (
                <button
                  key={page.filename}
                  onClick={(e) => {
                    const imgEl = e.currentTarget.querySelector("img") as HTMLImageElement | null;
                    const ar = imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0
                      ? imgEl.naturalWidth / imgEl.naturalHeight
                      : undefined;
                    placeColoringPage(page, ar);
                    setShowColoringPanel(false);
                  }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-indigo-50 text-left transition"
                >
                  <img
                    src={page.url}
                    alt={page.name}
                    className="w-14 h-14 object-contain border border-gray-200 rounded bg-white flex-shrink-0"
                  />
                  <span className="text-xs text-gray-700 capitalize leading-tight">{page.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Text hint ──────────────────────────────────────────────────────────── */}
      {textInput && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-white/80 rounded-lg px-3 py-1 shadow text-xs text-gray-500">
          Type · <strong>Enter</strong> for new line · <strong>Esc</strong> to place text
        </div>
      )}
    </div>
  );
}
