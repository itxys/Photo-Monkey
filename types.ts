
export enum ToolType {
  BRUSH = 'BRUSH',
  ERASER = 'ERASER',
  SELECT_RECT = 'SELECT_RECT',
  SELECT_ELLIPSE = 'SELECT_ELLIPSE',
  SELECT_LASSO = 'SELECT_LASSO',
  SELECT_POLY_LASSO = 'SELECT_POLY_LASSO',
  SELECT_WAND = 'SELECT_WAND',
  MOVE = 'MOVE',
  HAND = 'HAND',
  FILL = 'FILL',
  PICKER = 'PICKER',
  AI_EDIT = 'AI_EDIT',
  SMUDGE = 'SMUDGE',
  TEXT = 'TEXT'
}

export type BlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn';

export interface BrushPreset {
  id: string;
  name: string;
  image?: HTMLImageElement; // used for stamping
  icon?: string; // base64 representation for the UI icon
  spacing: number; // 0.01 to 1.0
  hardness: number; // 0 to 1
  size?: number; // optionally save size
  isCustom?: boolean;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  textData?: {
    content: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    x: number;
    y: number;
  };
}

export interface EditorState {
  activeTool: ToolType;
  brushSize: number;
  brushColor: string;
  brushOpacity: number;
  layers: Layer[];
  activeLayerId: string;
  zoom: number;
}
