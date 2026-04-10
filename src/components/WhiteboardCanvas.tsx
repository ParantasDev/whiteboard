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

const CANVAS_W = 1600;
const CANVAS_H = 900;

const COLORS = [
  "#1e293b", // near-black
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#ffffff",  // white
];

const STROKE_WIDTHS = [2, 6, 14];

// Player 0 = indigo, Player 1 = amber
const PLAYER_COLORS = ["#6366f1", "#f59e0b"];

const TOOL_LABELS: Record<ToolType, string> = {
  pen: "Pen",
  rect: "Rect",
  ellipse: "Ellipse",
  line: "Line",
  arrow: "Arrow",
  text: "Text",
  eraser: "Eraser",
};

// SVG icon paths (viewBox="0 0 24 24")
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
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string
) {
  const headLen = Math.max(16, width * 4);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
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
      if (el.filled) {
        ctx.fillStyle = el.color + "33";
        ctx.fillRect(el.x, el.y, el.w, el.h);
      }
      ctx.strokeRect(el.x, el.y, el.w, el.h);
      break;

    case "ellipse":
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.beginPath();
      ctx.ellipse(el.cx, el.cy, el.rx, el.ry, 0, 0, Math.PI * 2);
      if (el.filled) {
        ctx.fillStyle = el.color + "33";
        ctx.fill();
      }
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

// ── Eraser hit detection ───────────────────────────────────────────────────────

function elementHitByEraser(
  el: DrawElement,
  eraserPoints: Point[],
  radius: number
): boolean {
  switch (el.type) {
    case "stroke":
      return el.points.some((p) =>
        eraserPoints.some((ep) => Math.hypot(p.x - ep.x, p.y - ep.y) < radius)
      );
    case "rect":
      return eraserPoints.some(
        (ep) =>
          ep.x >= el.x - radius &&
          ep.x <= el.x + el.w + radius &&
          ep.y >= el.y - radius &&
          ep.y <= el.y + el.h + radius
      );
    case "ellipse":
      return eraserPoints.some(
        (ep) => Math.hypot(ep.x - el.cx, ep.y - el.cy) < Math.max(el.rx, el.ry) + radius
      );
    case "line":
    case "arrow": {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const lenSq = dx * dx + dy * dy;
      return eraserPoints.some((ep) => {
        if (lenSq < 1) return false;
        const t = Math.max(0, Math.min(1, ((ep.x - el.x1) * dx + (ep.y - el.y1) * dy) / lenSq));
        return Math.hypot(ep.x - (el.x1 + t * dx), ep.y - (el.y1 + t * dy)) < radius;
      });
    }
    case "text":
      return eraserPoints.some(
        (ep) =>
          ep.x >= el.x - radius &&
          ep.x <= el.x + 300 &&
          ep.y >= el.y - el.fontSize - radius &&
          ep.y <= el.y + radius
      );
  }
}

// ── Preview shape type (mirrors RemotePreview but also includes rect/ellipse details) ──

type PreviewShape =
  | { type: "stroke"; points: Point[]; color: string; width: number }
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string; width: number; filled: boolean }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; color: string; width: number; filled: boolean }
  | { type: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number };

// ── Props ─────────────────────────────────────────────────────────────────────

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

// ── Text input state ───────────────────────────────────────────────────────────

interface TextInputState {
  canvasX: number;
  canvasY: number;
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

  // Tools / appearance state
  const [tool, setTool] = useState<ToolType>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [filled, setFilled] = useState(false);

  // Text overlay
  const [textInput, setTextInput] = useState<TextInputState | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // Live drawing state (kept in refs to avoid re-render on every mouse move)
  const drawingRef = useRef({ active: false, startX: 0, startY: 0, points: [] as Point[] });
  const previewRef = useRef<PreviewShape | null>(null);
  const eraserRef = useRef<Point[]>([]);

  // Throttle socket sends
  const lastSocketSendRef = useRef(0);

  // Keep tool/color/width accessible in callbacks without stale closures
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

  // ── Coordinate helpers ────────────────────────────────────────────────────────

  const toCanvas = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * CANVAS_W,
      y: ((clientY - r.top) / r.height) * CANVAS_H,
    };
  }, []);

  const canvasToScreen = useCallback((cx: number, cy: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: (cx / CANVAS_W) * r.width + r.left,
      y: (cy / CANVAS_H) * r.height + r.top,
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

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Dot grid
    ctx.fillStyle = "rgba(148,163,184,0.35)";
    const grid = 32;
    for (let gx = grid; gx < W; gx += grid) {
      for (let gy = grid; gy < H; gy += grid) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Committed elements
    for (const el of elementsRef.current) {
      renderElement(ctx, el);
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
        ctx.strokeStyle = rp.color;
        ctx.lineWidth = rp.width;
        ctx.strokeRect(rp.x, rp.y, rp.w, rp.h);
      } else if (rp.type === "ellipse") {
        ctx.strokeStyle = rp.color;
        ctx.lineWidth = rp.width;
        ctx.beginPath();
        ctx.ellipse(rp.cx, rp.cy, rp.rx, rp.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (rp.type === "line" || rp.type === "arrow") {
        ctx.strokeStyle = rp.color;
        ctx.lineWidth = rp.width;
        ctx.beginPath();
        ctx.moveTo(rp.x1, rp.y1);
        ctx.lineTo(rp.x2, rp.y2);
        ctx.stroke();
        if (rp.type === "arrow") drawArrowHead(ctx, rp.x1, rp.y1, rp.x2, rp.y2, rp.width, rp.color);
      }
      ctx.restore();
    }

    // Local preview
    const p = previewRef.current;
    if (p) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;

      if (p.type === "stroke") {
        drawSmoothedStroke(ctx, p.points, p.color, p.width);
      } else if (p.type === "rect") {
        if (p.filled) { ctx.fillStyle = p.color + "33"; ctx.fillRect(p.x, p.y, p.w, p.h); }
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      } else if (p.type === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, Math.PI * 2);
        if (p.filled) { ctx.fillStyle = p.color + "33"; ctx.fill(); }
        ctx.stroke();
      } else if (p.type === "line" || p.type === "arrow") {
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        if (p.type === "arrow") drawArrowHead(ctx, p.x1, p.y1, p.x2, p.y2, p.width, p.color);
      }
      ctx.restore();
    }

    // Eraser circle indicator
    if (toolRef.current === "eraser" && drawingRef.current.active) {
      const pts = drawingRef.current.points;
      const last = pts[pts.length - 1];
      if (last) {
        ctx.save();
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(last.x, last.y, strokeWidthRef.current * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Remote cursor
    if (remoteCursor) {
      const { x, y } = remoteCursor;
      const rc = PLAYER_COLORS[1 - playerIndexRef.current] ?? PLAYER_COLORS[1];
      ctx.save();
      ctx.fillStyle = rc;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      // Arrow cursor shape
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10, y + 14);
      ctx.lineTo(x + 6, y + 14);
      ctx.lineTo(x + 8.5, y + 20);
      ctx.lineTo(x + 6.5, y + 20.5);
      ctx.lineTo(x + 4, y + 14.5);
      ctx.lineTo(x, y + 17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Border
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    ctx.restore();
  }, [remotePreview, remoteCursor]);

  // RAF loop
  useEffect(() => {
    const loop = () => {
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // Set canvas internal resolution to match logical size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
  }, []);

  // ── Mouse handlers ────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (textInput) return;
      const pt = toCanvas(e.clientX, e.clientY);
      drawingRef.current = { active: true, startX: pt.x, startY: pt.y, points: [pt] };

      if (toolRef.current === "text") {
        drawingRef.current.active = false;
        setTextInput({ canvasX: pt.x, canvasY: pt.y });
        setTextValue("");
        return;
      }
    },
    [textInput, toCanvas]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pt = toCanvas(e.clientX, e.clientY);

      // Throttle socket messages to ~30fps
      const now = Date.now();
      if (now - lastSocketSendRef.current > 33) {
        onCursorMove(pt.x, pt.y);
        lastSocketSendRef.current = now;
      }

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
        const x = Math.min(startX, pt.x);
        const y = Math.min(startY, pt.y);
        const pw = Math.abs(pt.x - startX);
        const ph = Math.abs(pt.y - startY);
        previewRef.current = { type: "rect", x, y, w: pw, h: ph, color: c, width: w, filled: f };
        if (now - lastSocketSendRef.current > 33) {
          onPreviewUpdate({ type: "rect", x, y, w: pw, h: ph, color: c, width: w });
          lastSocketSendRef.current = now;
        }
      } else if (t === "ellipse") {
        const cx = (startX + pt.x) / 2;
        const cy = (startY + pt.y) / 2;
        const rx = Math.abs(pt.x - startX) / 2;
        const ry = Math.abs(pt.y - startY) / 2;
        previewRef.current = { type: "ellipse", cx, cy, rx, ry, color: c, width: w, filled: f };
        if (now - lastSocketSendRef.current > 33) {
          onPreviewUpdate({ type: "ellipse", cx, cy, rx, ry, color: c, width: w });
          lastSocketSendRef.current = now;
        }
      } else if (t === "line" || t === "arrow") {
        previewRef.current = { type: t, x1: startX, y1: startY, x2: pt.x, y2: pt.y, color: c, width: w };
        if (now - lastSocketSendRef.current > 33) {
          onPreviewUpdate({ type: t, x1: startX, y1: startY, x2: pt.x, y2: pt.y, color: c, width: w });
          lastSocketSendRef.current = now;
        }
      }
    },
    [toCanvas, onCursorMove, onPreviewUpdate]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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
        const el: StrokeElement = { id: uuidv4(), type: "stroke", points, color: c, width: w, playerIndex: pi };
        onElementComplete(el);
      } else if (t === "eraser") {
        const ep = [...eraserRef.current];
        eraserRef.current = [];
        if (ep.length === 0) return;
        const radius = w * 5;
        const hits = elementsRef.current.filter((el) => elementHitByEraser(el, ep, radius));
        if (hits.length > 0) onErase(hits.map((el) => el.id));
      } else if (t === "rect") {
        const x = Math.min(startX, pt.x);
        const y = Math.min(startY, pt.y);
        const rw = Math.abs(pt.x - startX);
        const rh = Math.abs(pt.y - startY);
        if (rw < 5 || rh < 5) return;
        const el: RectElement = { id: uuidv4(), type: "rect", x, y, w: rw, h: rh, color: c, width: w, filled: f, playerIndex: pi };
        onElementComplete(el);
      } else if (t === "ellipse") {
        const rx = Math.abs(pt.x - startX) / 2;
        const ry = Math.abs(pt.y - startY) / 2;
        if (rx < 5 || ry < 5) return;
        const el: EllipseElement = {
          id: uuidv4(), type: "ellipse",
          cx: (startX + pt.x) / 2, cy: (startY + pt.y) / 2,
          rx, ry, color: c, width: w, filled: f, playerIndex: pi,
        };
        onElementComplete(el);
      } else if (t === "line") {
        if (Math.hypot(pt.x - startX, pt.y - startY) < 5) return;
        const el: LineElement = { id: uuidv4(), type: "line", x1: startX, y1: startY, x2: pt.x, y2: pt.y, color: c, width: w, playerIndex: pi };
        onElementComplete(el);
      } else if (t === "arrow") {
        if (Math.hypot(pt.x - startX, pt.y - startY) < 5) return;
        const el: ArrowElement = { id: uuidv4(), type: "arrow", x1: startX, y1: startY, x2: pt.x, y2: pt.y, color: c, width: w, playerIndex: pi };
        onElementComplete(el);
      }
    },
    [toCanvas, onElementComplete, onPreviewUpdate, onErase]
  );

  const handleMouseLeave = useCallback(() => {
    if (drawingRef.current.active) {
      drawingRef.current.active = false;
      previewRef.current = null;
      onPreviewUpdate(null);
      eraserRef.current = [];
    }
  }, [onPreviewUpdate]);

  // ── Text commit ───────────────────────────────────────────────────────────────

  const commitText = useCallback(() => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      setTextValue("");
      return;
    }
    const el: TextElement = {
      id: uuidv4(),
      type: "text",
      x: textInput.canvasX,
      y: textInput.canvasY,
      text: textValue.trim(),
      color: colorRef.current,
      fontSize: 28,
      playerIndex: playerIndexRef.current,
    };
    onElementComplete(el);
    setTextInput(null);
    setTextValue("");
  }, [textInput, textValue, onElementComplete]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textInput) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        onUndo(playerIndexRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [textInput, onUndo]);

  // ── Text input screen position ────────────────────────────────────────────────

  const textScreenPos = textInput ? canvasToScreen(textInput.canvasX, textInput.canvasY) : null;
  const textFontSize = (() => {
    const canvas = canvasRef.current;
    if (!canvas) return 28;
    const r = canvas.getBoundingClientRect();
    return (28 / CANVAS_H) * r.height;
  })();

  // ── Cursor style ──────────────────────────────────────────────────────────────

  const cursorStyle =
    tool === "text" ? "text" : tool === "eraser" ? "none" : "crosshair";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex w-full h-full bg-slate-700 select-none">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 w-14 shrink-0 bg-slate-800 border-r border-slate-700 py-2 px-1 overflow-y-auto z-10">
        {/* Tools */}
        {(Object.keys(TOOL_LABELS) as ToolType[]).map((t) => (
          <button
            key={t}
            title={TOOL_LABELS[t]}
            onClick={() => setTool(t)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition
              ${tool === t
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50"
                : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              }`}
          >
            {TOOL_ICONS[t]}
          </button>
        ))}

        {/* Fill toggle */}
        <div className="h-px bg-slate-700 my-1" />
        {(tool === "rect" || tool === "ellipse") && (
          <button
            title="Toggle fill"
            onClick={() => setFilled((f) => !f)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition text-xs font-medium
              ${filled ? "bg-slate-600 text-white" : "text-slate-500 hover:bg-slate-700"}`}
          >
            Fill
          </button>
        )}

        {/* Stroke widths */}
        <div className="h-px bg-slate-700 my-1" />
        {STROKE_WIDTHS.map((w, i) => (
          <button
            key={w}
            title={`Size ${i + 1}`}
            onClick={() => setStrokeWidth(w)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition
              ${strokeWidth === w ? "bg-slate-600" : "hover:bg-slate-700"}`}
          >
            <div
              className="rounded-full"
              style={{
                width: [6, 11, 18][i],
                height: [6, 11, 18][i],
                background: color === "#ffffff" ? "#94a3b8" : color,
              }}
            />
          </button>
        ))}

        {/* Colors */}
        <div className="h-px bg-slate-700 my-1" />
        {COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => setColor(c)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition
              ${color === c ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-800" : "hover:scale-105"}`}
          >
            <div
              className="w-7 h-7 rounded-full border border-slate-500"
              style={{ background: c }}
            />
          </button>
        ))}

        {/* Actions */}
        <div className="h-px bg-slate-700 my-1" />
        <button
          title="Undo (Ctrl+Z)"
          onClick={() => onUndo(playerIndexRef.current)}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          title="Clear all"
          onClick={onClear}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:bg-red-900/40 hover:text-red-400 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>

      {/* ── Canvas area ──────────────────────────────────────────────────────── */}
      <div ref={wrapperRef} className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-600">
        <canvas
          ref={canvasRef}
          style={{
            cursor: cursorStyle,
            maxWidth: "100%",
            maxHeight: "100%",
            display: "block",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />

        {/* Text input overlay */}
        {textInput && textScreenPos && (
          <input
            ref={textInputRef}
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText();
              if (e.key === "Escape") { setTextInput(null); setTextValue(""); }
            }}
            onBlur={commitText}
            style={{
              position: "fixed",
              left: textScreenPos.x,
              top: textScreenPos.y - 4,
              fontSize: `${textFontSize}px`,
              color: color,
              minWidth: 120,
              background: "transparent",
              outline: "none",
              borderBottom: "2px dashed currentColor",
              fontFamily: "sans-serif",
              zIndex: 50,
            }}
          />
        )}
      </div>
    </div>
  );
}
