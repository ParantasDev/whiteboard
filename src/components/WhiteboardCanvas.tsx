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
const GRID_SIZE = 32;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;

const TOOL_LABELS: Record<ToolType, string> = {
  pen: "Pen",
  rect: "Rect",
  ellipse: "Ellipse",
  line: "Line",
  arrow: "Arrow",
  text: "Text",
  eraser: "Eraser",
};

const TOOL_TIPS: Record<ToolType, string> = {
  pen: "Draw freehand",
  rect: "Click & drag to draw a rectangle",
  ellipse: "Click & drag to draw an ellipse",
  line: "Click & drag to draw a line",
  arrow: "Click & drag to draw an arrow",
  text: "Click anywhere to place text, then press Enter",
  eraser: "Click & drag to erase",
};

const TOOL_ICONS: Record<ToolType, React.ReactNode> = {
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
};

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
      drawSmoothedStroke(ctx, el.points, el.color, el.width);
      break;
    case "rect":
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      if (el.filled) { ctx.fillStyle = el.color + "33"; ctx.fillRect(el.x, el.y, el.w, el.h); }
      ctx.strokeRect(el.x, el.y, el.w, el.h);
      break;
    case "ellipse":
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.ellipse(el.cx, el.cy, el.rx, el.ry, 0, 0, Math.PI * 2);
      if (el.filled) { ctx.fillStyle = el.color + "33"; ctx.fill(); }
      ctx.stroke();
      break;
    case "line":
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      break;
    case "arrow":
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      drawArrowHead(ctx, el.x1, el.y1, el.x2, el.y2, el.width, el.color);
      break;
    case "text":
      ctx.fillStyle = el.color;
      ctx.font = `${el.fontSize}px sans-serif`;
      el.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, el.x, el.y + i * el.fontSize * 1.3);
      });
      break;
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
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PreviewShape =
  | { type: "stroke"; points: Point[]; color: string; width: number }
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string; width: number; filled: boolean }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; color: string; width: number; filled: boolean }
  | { type: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number };

interface WhiteboardCanvasProps {
  elements: DrawElement[];
  remoteCursor: RemoteCursor | null;
  remotePreview: RemotePreview | null;
  playerIndex: number;
  onElementComplete: (el: DrawElement) => void;
  onPreviewUpdate: (preview: RemotePreview | null) => void;
  onCursorMove: (x: number, y: number) => void;
  onUndo: (playerIndex: number) => void;
  onErase: (ids: string[]) => void;
  onClear: () => void;
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
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // View (pan + zoom) — stored in a ref for the render loop, mirrored to state for UI
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

  // Text input (canvas-based — no DOM input element)
  const [textInput, setTextInput] = useState<TextInputState | null>(null);
  const [textValue, setTextValue] = useState("");
  const textValueRef = useRef("");           // for render loop access
  const textInputPosRef = useRef<TextInputState | null>(null); // for render loop access
  const textActiveRef = useRef(false);       // for space-key handler
  const cursorPosRef = useRef(0);            // character index within textValue

  // Drawing state in refs (no re-render on each mouse move)
  const drawingRef = useRef({ active: false, startX: 0, startY: 0, points: [] as Point[] });
  const previewRef = useRef<PreviewShape | null>(null);
  const eraserRef = useRef<Point[]>([]);
  const lastSocketSendRef = useRef(0);
  const mousePosRef = useRef<Point | null>(null);

  // Stable refs for callbacks
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  const filledRef = useRef(filled);
  const playerIndexRef = useRef(playerIndex);
  const elementsRef = useRef(elements);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
  useEffect(() => { filledRef.current = filled; }, [filled]);
  useEffect(() => { playerIndexRef.current = playerIndex; }, [playerIndex]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { textValueRef.current = textValue; }, [textValue]);
  useEffect(() => { textInputPosRef.current = textInput; textActiveRef.current = !!textInput; }, [textInput]);

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

    // Clear in screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Apply pan/zoom — everything below is in world coordinates
    ctx.setTransform(zoom, 0, 0, zoom, panX, panY);

    // Committed elements
    for (const el of elementsRef.current) renderElement(ctx, el);

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
        ctx.beginPath(); ctx.moveTo(rp.x1, rp.y1); ctx.lineTo(rp.x2, rp.y2); ctx.stroke();
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
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        if (p.type === "arrow") drawArrowHead(ctx, p.x1, p.y1, p.x2, p.y2, p.width, p.color);
      }
      ctx.restore();
    }

    // Text preview while typing (world space, multiline)
    if (textInputPosRef.current) {
      const { worldX, worldY } = textInputPosRef.current;
      const tv = textValueRef.current;
      const lines = tv.split("\n");
      const lineH = 28 * 1.3;
      const showCursor = Math.floor(Date.now() / 530) % 2 === 0;
      ctx.save();
      ctx.fillStyle = colorRef.current;
      ctx.font = "28px sans-serif";
      lines.forEach((line, i) => ctx.fillText(line, worldX, worldY + i * lineH));
      // Blinking cursor at correct character position
      if (showCursor) {
        const { line: curLine, col: curCol } = getLineCol(tv, cursorPosRef.current);
        const cursorX = worldX + ctx.measureText(lines[curLine].slice(0, curCol)).width;
        const cursorY = worldY + curLine * lineH;
        ctx.fillRect(cursorX, cursorY - 24, 2 / zoom, 30);
      }
      // dashed underline on first line
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

    // Eraser circle — drawn in screen space so it stays constant size
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

    // Remote cursor — drawn in screen space so it stays constant size
    if (remoteCursor) {
      const sx = remoteCursor.x * zoom + panX;
      const sy = remoteCursor.y * zoom + panY;
      const rc = PLAYER_COLORS[1 - playerIndexRef.current] ?? PLAYER_COLORS[1];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
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
      ctx.restore();
    }
  }, [remotePreview, remoteCursor]);

  // RAF loop
  useEffect(() => {
    const loop = () => { render(); rafRef.current = requestAnimationFrame(loop); };
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

  // ── Wheel: zoom (ctrl) or pan (plain scroll) ───────────────────────────────────

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

  // ── Space key: pan cursor ─────────────────────────────────────────────────────

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
        onElementComplete({
          id: uuidv4(), type: "text",
          x: ti.worldX, y: ti.worldY,
          text: tv, color: colorRef.current,
          fontSize: 28, playerIndex: playerIndexRef.current,
        } as TextElement);
      }
      setTextInput(null);
      setTextValue("");
      textValueRef.current = "";
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        commitCurrentText();
        cursorPosRef.current = 0;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        cursorPosRef.current = Math.max(0, cursorPosRef.current - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        cursorPosRef.current = Math.min(textValueRef.current.length, cursorPosRef.current + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        cursorPosRef.current = moveCursorVertical(textValueRef.current, cursorPosRef.current, -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        cursorPosRef.current = moveCursorVertical(textValueRef.current, cursorPosRef.current, 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const pos = cursorPosRef.current;
        setTextValue((prev) => {
          const n = prev.slice(0, pos) + "\n" + prev.slice(pos);
          textValueRef.current = n;
          cursorPosRef.current = pos + 1;
          return n;
        });
      } else if (e.key === "Backspace") {
        e.preventDefault();
        const pos = cursorPosRef.current;
        if (pos === 0) return;
        setTextValue((prev) => {
          const n = prev.slice(0, pos - 1) + prev.slice(pos);
          textValueRef.current = n;
          cursorPosRef.current = pos - 1;
          return n;
        });
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const pos = cursorPosRef.current;
        setTextValue((prev) => {
          const n = prev.slice(0, pos) + e.key + prev.slice(pos);
          textValueRef.current = n;
          cursorPosRef.current = pos + 1;
          return n;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textInput) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); onUndo(playerIndexRef.current); }
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "+" || e.key === "=") { e.preventDefault(); applyZoom(1.25); }
        if (e.key === "-") { e.preventDefault(); applyZoom(1 / 1.25); }
        if (e.key === "0") { e.preventDefault(); resetView(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [textInput, onUndo, applyZoom, resetView]);

  // ── Mouse handlers ────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const isPanTrigger = e.button === 1 || (e.button === 0 && spaceDownRef.current);

      if (isPanTrigger) {
        e.preventDefault();
        isPanningRef.current = true;
        setCursorOverride("grabbing");
        panStartRef.current = {
          screenX: e.clientX,
          screenY: e.clientY,
          panX: viewRef.current.panX,
          panY: viewRef.current.panY,
        };
        return;
      }

      const pt = toCanvas(e.clientX, e.clientY);

      if (textInput) {
        // Click while typing → move cursor to clicked position
        const ti = textInputPosRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (ti && ctx) {
          ctx.font = "28px sans-serif";
          const tv = textValueRef.current;
          const lines = tv.split("\n");
          const lineH = 28 * 1.3;
          const lineIdx = Math.max(0, Math.min(lines.length - 1,
            Math.floor((pt.y - ti.worldY + 28) / lineH)
          ));
          const charInLine = findCharInLine(ctx, lines[lineIdx], pt.x - ti.worldX);
          let absPos = 0;
          for (let i = 0; i < lineIdx; i++) absPos += lines[i].length + 1;
          cursorPosRef.current = absPos + charInLine;
        }
        return;
      }

      drawingRef.current = { active: true, startX: pt.x, startY: pt.y, points: [pt] };

      if (toolRef.current === "text") {
        drawingRef.current.active = false;

        // Check if clicking on an existing text element → edit it
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
    [textInput, toCanvas]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) return;

      const pt = toCanvas(e.clientX, e.clientY);
      const now = Date.now();
      if (now - lastSocketSendRef.current > 33) {
        onCursorMove(pt.x, pt.y);
        lastSocketSendRef.current = now;
      }

      mousePosRef.current = pt;

      if (!drawingRef.current.active) return;
      const { startX, startY } = drawingRef.current;
      const t = toolRef.current;
      const c = colorRef.current;
      const w = strokeWidthRef.current;
      const f = filledRef.current;

      if (t === "pen") {
        drawingRef.current.points.push(pt);
        previewRef.current = { type: "stroke", points: [...drawingRef.current.points], color: c, width: w };
        if (now - lastSocketSendRef.current > 33) {
          onPreviewUpdate({ type: "stroke", points: [...drawingRef.current.points], color: c, width: w });
          lastSocketSendRef.current = now;
        }
      } else if (t === "eraser") {
        drawingRef.current.points.push(pt);
        eraserRef.current = [...drawingRef.current.points];
      } else if (t === "rect") {
        const x = Math.min(startX, pt.x), y = Math.min(startY, pt.y);
        const pw = Math.abs(pt.x - startX), ph = Math.abs(pt.y - startY);
        previewRef.current = { type: "rect", x, y, w: pw, h: ph, color: c, width: w, filled: f };
        if (now - lastSocketSendRef.current > 33) { onPreviewUpdate({ type: "rect", x, y, w: pw, h: ph, color: c, width: w }); lastSocketSendRef.current = now; }
      } else if (t === "ellipse") {
        const cx = (startX + pt.x) / 2, cy = (startY + pt.y) / 2;
        const rx = Math.abs(pt.x - startX) / 2, ry = Math.abs(pt.y - startY) / 2;
        previewRef.current = { type: "ellipse", cx, cy, rx, ry, color: c, width: w, filled: f };
        if (now - lastSocketSendRef.current > 33) { onPreviewUpdate({ type: "ellipse", cx, cy, rx, ry, color: c, width: w }); lastSocketSendRef.current = now; }
      } else if (t === "line" || t === "arrow") {
        previewRef.current = { type: t, x1: startX, y1: startY, x2: pt.x, y2: pt.y, color: c, width: w };
        if (now - lastSocketSendRef.current > 33) { onPreviewUpdate({ type: t, x1: startX, y1: startY, x2: pt.x, y2: pt.y, color: c, width: w }); lastSocketSendRef.current = now; }
      }
    },
    [toCanvas, onCursorMove, onPreviewUpdate]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) return;
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

      if (t === "pen") {
        if (points.length < 2) return;
        onElementComplete({ id: uuidv4(), type: "stroke", points, color: c, width: w, playerIndex: pi } as StrokeElement);
      } else if (t === "eraser") {
        const ep = [...eraserRef.current];
        eraserRef.current = [];
        if (ep.length === 0) return;
        const hits = elementsRef.current.filter((el) => elementHitByEraser(el, ep, w * 5));
        if (hits.length > 0) onErase(hits.map((el) => el.id));
      } else if (t === "rect") {
        const x = Math.min(startX, pt.x), y = Math.min(startY, pt.y);
        const rw = Math.abs(pt.x - startX), rh = Math.abs(pt.y - startY);
        if (rw < 5 || rh < 5) return;
        onElementComplete({ id: uuidv4(), type: "rect", x, y, w: rw, h: rh, color: c, width: w, filled: f, playerIndex: pi } as RectElement);
      } else if (t === "ellipse") {
        const rx = Math.abs(pt.x - startX) / 2, ry = Math.abs(pt.y - startY) / 2;
        if (rx < 5 || ry < 5) return;
        onElementComplete({ id: uuidv4(), type: "ellipse", cx: (startX + pt.x) / 2, cy: (startY + pt.y) / 2, rx, ry, color: c, width: w, filled: f, playerIndex: pi } as EllipseElement);
      } else if (t === "line") {
        if (Math.hypot(pt.x - startX, pt.y - startY) < 5) return;
        onElementComplete({ id: uuidv4(), type: "line", x1: startX, y1: startY, x2: pt.x, y2: pt.y, color: c, width: w, playerIndex: pi } as LineElement);
      } else if (t === "arrow") {
        if (Math.hypot(pt.x - startX, pt.y - startY) < 5) return;
        onElementComplete({ id: uuidv4(), type: "arrow", x1: startX, y1: startY, x2: pt.x, y2: pt.y, color: c, width: w, playerIndex: pi } as ArrowElement);
      }
    },
    [toCanvas, onElementComplete, onPreviewUpdate, onErase]
  );

  const handleMouseLeave = useCallback(() => {
    mousePosRef.current = null;
    if (drawingRef.current.active) {
      drawingRef.current.active = false;
      previewRef.current = null;
      onPreviewUpdate(null);
      eraserRef.current = [];
    }
  }, [onPreviewUpdate]);

  // ── Tool change (commits active text first) ───────────────────────────────────

  const handleToolChange = useCallback((t: ToolType) => {
    if (textActiveRef.current) {
      const ti = textInputPosRef.current;
      const tv = textValueRef.current.trim();
      if (ti && tv) {
        onElementComplete({
          id: uuidv4(), type: "text",
          x: ti.worldX, y: ti.worldY,
          text: tv, color: colorRef.current,
          fontSize: 28, playerIndex: playerIndexRef.current,
        } as TextElement);
      }
      setTextInput(null);
      setTextValue("");
      textValueRef.current = "";
    }
    setTool(t);
  }, [onElementComplete]);

  // ── Derived UI values ─────────────────────────────────────────────────────────

  const cursorStyle = cursorOverride ?? (
    tool === "text" ? "text" : tool === "eraser" ? "none" : "crosshair"
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full bg-gray-100 select-none">

      {/* ── Top toolbar (floating) ─────────────────────────────────────────────── */}
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
          onClick={() => onUndo(playerIndexRef.current)}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          title="Clear all"
          onClick={onClear}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>

      {/* ── Left panel: colors + thickness (floating) ──────────────────────────── */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-3">
        {/* Stroke widths */}
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

        {/* Colors */}
        {COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => setColor(c)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition hover:scale-110
              ${color === c ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
          >
            <div
              className="w-5 h-5 rounded-full border border-gray-300"
              style={{ background: c }}
            />
          </button>
        ))}
      </div>

      {/* ── Zoom controls (floating, bottom-right) ─────────────────────────────── */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-1.5">
        <button
          title="Zoom out (-)"
          onClick={() => applyZoom(1 / 1.25)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition font-bold text-base"
        >
          −
        </button>
        <button
          title="Reset zoom (0)"
          onClick={resetView}
          className="px-2 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition text-xs font-mono"
        >
          {zoomDisplay}%
        </button>
        <button
          title="Zoom in (+)"
          onClick={() => applyZoom(1.25)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition font-bold text-base"
        >
          +
        </button>
      </div>

      {/* ── Tooltip hint below toolbar ────────────────────────────────────────── */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <span className="text-xs text-gray-400">{TOOL_TIPS[tool]}</span>
      </div>

      {/* ── Canvas (fills everything) ──────────────────────────────────────────── */}
      <div ref={wrapperRef} className="absolute inset-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ cursor: cursorStyle, display: "block", width: "100%", height: "100%" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* Text active hint */}
      {textInput && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-white/80 rounded-lg px-3 py-1 shadow text-xs text-gray-500">
          Type · <strong>Enter</strong> for new line · <strong>Esc</strong> to place text
        </div>
      )}
    </div>
  );
}
