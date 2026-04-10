export type Point = { x: number; y: number };

export type ToolType =
  | "pen"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "eraser";

export interface BaseElement {
  id: string;
  playerIndex: number;
}

export interface StrokeElement extends BaseElement {
  type: "stroke";
  points: Point[];
  color: string;
  width: number;
}

export interface RectElement extends BaseElement {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  width: number;
  filled: boolean;
}

export interface EllipseElement extends BaseElement {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
  width: number;
  filled: boolean;
}

export interface LineElement extends BaseElement {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

export interface ArrowElement extends BaseElement {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export type DrawElement =
  | StrokeElement
  | RectElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | TextElement;

export interface RemoteCursor {
  x: number;
  y: number;
  playerIndex: number;
}

export type RemotePreview =
  | { type: "stroke"; points: Point[]; color: string; width: number }
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string; width: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; color: string; width: number }
  | { type: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number };
