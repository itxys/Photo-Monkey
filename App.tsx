
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Paintbrush, 
  Eraser, 
  Layers, 
  Sparkles, 
  Download, 
  Plus, 
  Minus,
  Trash2, 
  Eye, 
  EyeOff, 
  MousePointer2, 
  Languages,
  ChevronDown,
  Settings2,
  AlertCircle,
  Sliders,
  Upload,
  Circle,
  FilePlus,
  RotateCw,
  PaintBucket,
  ChevronUp,
  Image as ImageIcon,
  Pipette,
  Hand,
  Maximize2,
  Palette,
  Keyboard,
  Check,
  X,
  GripVertical,
  Fingerprint
} from 'lucide-react';
import { ToolType, Layer, BlendMode, BrushPreset } from './types';
import { gemini } from './services/geminiService';
import { translations, Language } from './i18n';

// HSL color conversion utilities for Hue/Saturation adjustment
const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

interface Guide {
  id: string;
  type: 'h' | 'v';
  pos: number; 
}

interface ShortcutMap {
  [actionId: string]: string;
}

const DEFAULT_SHORTCUTS: ShortcutMap = {
  'TOOL_MOVE': 'v',
  'TOOL_BRUSH': 'b',
  'TOOL_ERASER': 'e',
  'TOOL_SMUDGE': 'r',
  'TOOL_FILL': 'g',
  'TOOL_PICKER': 'i',
  'TOOL_HAND': 'h',
  'MENU_NEW': 'Control+n',
  'MENU_SAVE': 'Control+s',
  'MENU_EXPORT': 'Control+Alt+s',
  'ZOOM_IN': 'Control+=',
  'ZOOM_OUT': 'Control+-',
  'FIT_SCREEN': 'Control+0',
  'TOGGLE_RULERS': 'Control+r'
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('zh');
  const t = translations[lang];

  // Shortcut State
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => {
    const saved = localStorage.getItem('pm_shortcuts');
    return saved ? JSON.parse(saved) : DEFAULT_SHORTCUTS;
  });
  const [altForPickerEnabled, setAltForPickerEnabled] = useState(() => {
    const saved = localStorage.getItem('pm_alt_picker');
    return saved ? JSON.parse(saved) : true;
  });
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Brush Settings
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.BRUSH);
  const [prevToolBeforeAlt, setPrevToolBeforeAlt] = useState<ToolType | null>(null);
  const [brushSize, setBrushSize] = useState(40);
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [brushSmoothing, setBrushSmoothing] = useState(0.4);
  const [brushSpacing, setBrushSpacing] = useState(0.1);
  const [brushHardness, setBrushHardness] = useState(0.8);
  const [fillTolerance, setFillTolerance] = useState(30);
  const [smudgeStrength, setSmudgeStrength] = useState(0.5);
  
  // Brush Library
  const [brushPresets, setBrushPresets] = useState<BrushPreset[]>([
    { id: 'round', name: 'Round', spacing: 0.1, hardness: 0.8 },
    { id: 'soft', name: 'Soft Round', spacing: 0.15, hardness: 0.1 },
    { id: 'square', name: 'Square', spacing: 0.05, hardness: 1.0 },
  ]);
  const [activeBrushId, setActiveBrushId] = useState('round');
  const [showBrushLib, setShowBrushLib] = useState(false);
  const [draggedBrushIdx, setDraggedBrushIdx] = useState<number | null>(null);

  // App States
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 900 });
  const [canvasBgColor, setCanvasBgColor] = useState('#1a1a1a');
  const [workspaceColor, setWorkspaceColor] = useState('#121212');
  const [zoom, setZoom] = useState(0.8);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Rulers & Guides
  const [showRulers, setShowRulers] = useState(true);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, isWorkspace?: boolean } | null>(null);

  // Modal States
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showHueSatModal, setShowHueSatModal] = useState(false);
  const [hueAdjust, setHueAdjust] = useState(0);
  const [satAdjust, setSatAdjust] = useState(0);
  const [lightAdjust, setLightAdjust] = useState(0);
  const [showCanvasSettings, setShowCanvasSettings] = useState(false);
  const [showResizeConfirm, setShowResizeConfirm] = useState(false);
  const [showDeleteLayerConfirm, setShowDeleteLayerConfirm] = useState(false);
  const [layerToDeleteId, setLayerToDeleteId] = useState<string | null>(null);
  const [tempCanvasSettings, setTempCanvasSettings] = useState({ width: 1200, height: 900, bgColor: '#1a1a1a' });
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [tempLayerName, setTempLayerName] = useState<string>('');

  const viewportRef = useRef<HTMLDivElement>(null);
  const lastSmoothPos = useRef<{ x: number, y: number } | null>(null);
  const lastPanPos = useRef<{ x: number, y: number } | null>(null);
  const brushDistanceCounter = useRef<number>(0);
  const smudgeBuffer = useRef<HTMLCanvasElement | null>(null);
  const abrInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const workspaceColorRef = useRef<HTMLInputElement>(null);
  const [targetIconBrushId, setTargetIconBrushId] = useState<string | null>(null);

  const addNewLayer = useCallback((name?: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    if (layers.length === 0) {
      ctx.fillStyle = canvasBgColor;
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    }
    const newLayer: Layer = {
      id: Math.random().toString(36).substr(2, 9),
      name: name || `${t.layers.layerName} ${layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'source-over',
      canvas,
      ctx
    };
    setLayers(prev => [newLayer, ...prev]);
    setActiveLayerId(newLayer.id);
  }, [canvasSize, canvasBgColor, layers.length, t]);

  const handleFitScreen = useCallback(() => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const rulerSize = showRulers ? 20 : 0;
    const padding = 100;
    const availW = rect.width - padding - rulerSize;
    const availH = rect.height - padding - rulerSize;
    const scale = Math.min(availW / canvasSize.width, availH / canvasSize.height);
    setZoom(scale);
    setCanvasOffset({ x: 0, y: 0 });
  }, [canvasSize, showRulers]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.1));
  const handleResetZoom = () => {
    setZoom(1.0);
    setCanvasOffset({ x: 0, y: 0 });
  };

  const handleDownload = () => {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = canvasSize.width;
    finalCanvas.height = canvasSize.height;
    const finalCtx = finalCanvas.getContext('2d')!;
    [...layers].reverse().forEach(layer => {
      if (layer.visible) {
        finalCtx.globalAlpha = layer.opacity;
        finalCtx.globalCompositeOperation = layer.blendMode;
        finalCtx.drawImage(layer.canvas, 0, 0);
      }
    });
    const link = document.createElement('a');
    link.download = `photo-monkey-${Date.now()}.png`;
    link.href = finalCanvas.toDataURL('image/png');
    link.click();
  };

  // Fix: Implement missing handleExportSelectedLayer function
  const handleExportSelectedLayer = useCallback(() => {
    const active = layers.find(l => l.id === activeLayerId);
    if (!active) return;
    const link = document.createElement('a');
    link.download = `layer-${active.name}-${Date.now()}.png`;
    link.href = active.canvas.toDataURL('image/png');
    link.click();
  }, [activeLayerId, layers]);

  // Fix: Implement missing handleWheel function
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const zoomSpeed = 0.001;
      const delta = -e.deltaY * zoomSpeed;
      setZoom(prev => Math.max(0.1, Math.min(5, prev + delta)));
    } else {
      setCanvasOffset(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  // Shortcut Listener
  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.code === 'Space' && !isSpacePressed) {
        setIsSpacePressed(true);
      }

      // Temporary Tool Switch (Alt for Picker)
      if (e.altKey && altForPickerEnabled && activeTool === ToolType.BRUSH && !prevToolBeforeAlt) {
        setPrevToolBeforeAlt(ToolType.BRUSH);
        setActiveTool(ToolType.PICKER);
        return;
      }

      // Build key string
      const parts = [];
      if (e.ctrlKey || e.metaKey) parts.push('Control');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) parts.push(e.key.toLowerCase());
      const keyCombo = parts.join('+');

      // Find action
      const action = Object.entries(shortcuts).find(([_, combo]) => combo === keyCombo)?.[0];

      if (action) {
        e.preventDefault();
        switch (action) {
          case 'TOOL_MOVE': setActiveTool(ToolType.MOVE); break;
          case 'TOOL_BRUSH': setActiveTool(ToolType.BRUSH); break;
          case 'TOOL_ERASER': setActiveTool(ToolType.ERASER); break;
          case 'TOOL_SMUDGE': setActiveTool(ToolType.SMUDGE); break;
          case 'TOOL_FILL': setActiveTool(ToolType.FILL); break;
          case 'TOOL_PICKER': setActiveTool(ToolType.PICKER); break;
          case 'TOOL_HAND': setActiveTool(ToolType.HAND); break;
          case 'MENU_NEW': addNewLayer(); break;
          case 'MENU_SAVE': handleDownload(); break;
          case 'ZOOM_IN': handleZoomIn(); break;
          case 'ZOOM_OUT': handleZoomOut(); break;
          case 'FIT_SCREEN': handleFitScreen(); break;
          case 'TOGGLE_RULERS': setShowRulers(prev => !prev); break;
        }
      }
    };

    const handleKeyUpGlobal = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
      
      // Revert temporary tool switch
      if (e.key === 'Alt' && prevToolBeforeAlt) {
        setActiveTool(prevToolBeforeAlt);
        setPrevToolBeforeAlt(null);
      }
    };

    window.addEventListener('keydown', handleKeyDownGlobal);
    window.addEventListener('keyup', handleKeyUpGlobal);
    return () => {
      window.removeEventListener('keydown', handleKeyDownGlobal);
      window.removeEventListener('keyup', handleKeyUpGlobal);
    };
  }, [shortcuts, isSpacePressed, addNewLayer, handleFitScreen, activeTool, prevToolBeforeAlt, altForPickerEnabled]);

  useEffect(() => {
    if (layers.length === 0) {
      addNewLayer(t.layers.background);
    }
  }, []);

  const initiateRemoveLayer = (id: string) => {
    if (layers.length <= 1) return;
    setLayerToDeleteId(id);
    setShowDeleteLayerConfirm(true);
  };

  const executeRemoveLayer = () => {
    if (!layerToDeleteId) return;
    const id = layerToDeleteId;
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeLayerId === id) {
      const remaining = layers.filter(l => l.id !== id);
      setActiveLayerId(remaining[0].id);
    }
    setShowDeleteLayerConfirm(false);
    setLayerToDeleteId(null);
  };

  const updateLayerName = (id: string, newName: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, name: newName || l.name } : l));
    setEditingLayerId(null);
  };

  const getActiveLayer = () => layers.find(l => l.id === activeLayerId);

  const executeResize = () => {
    const { width, height, bgColor } = tempCanvasSettings;
    const updatedLayers = layers.map(layer => {
      const newCanvas = document.createElement('canvas');
      newCanvas.width = width;
      newCanvas.height = height;
      const newCtx = newCanvas.getContext('2d');
      if (newCtx) {
        if (layer.name === t.layers.background) {
            newCtx.fillStyle = bgColor;
            newCtx.fillRect(0, 0, width, height);
        }
        newCtx.drawImage(layer.canvas, 0, 0);
      }
      return { ...layer, canvas: newCanvas, ctx: newCtx! };
    });
    setCanvasSize({ width, height });
    setCanvasBgColor(bgColor);
    setLayers(updatedLayers);
    setShowResizeConfirm(false);
    setShowCanvasSettings(false);
  };

  const sampleColor = (x: number, y: number) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1;
    tempCanvas.height = 1;
    const tempCtx = tempCanvas.getContext('2d')!;
    
    [...layers].reverse().forEach(layer => {
      if (layer.visible) {
        tempCtx.globalAlpha = layer.opacity;
        tempCtx.globalCompositeOperation = layer.blendMode;
        tempCtx.drawImage(layer.canvas, x, y, 1, 1, 0, 0, 1, 1);
      }
    });
    
    const [r, g, b] = tempCtx.getImageData(0, 0, 1, 1).data;
    const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    setBrushColor(hex);
    return hex;
  };

  const paintStamp = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, opacity: number, pressure: number) => {
    const currentBrush = brushPresets.find(b => b.id === activeBrushId);
    const finalSize = size * (pressure + 0.2);
    const finalOpacity = opacity * (pressure + 0.2);

    ctx.save();
    ctx.translate(x, y);

    if (activeTool === ToolType.ERASER) {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    if (currentBrush?.image) {
      ctx.globalAlpha = finalOpacity;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = finalSize;
      offCanvas.height = finalSize;
      const offCtx = offCanvas.getContext('2d')!;
      offCtx.drawImage(currentBrush.image, 0, 0, finalSize, finalSize);
      offCtx.globalCompositeOperation = 'source-in';
      offCtx.fillStyle = color;
      offCtx.fillRect(0, 0, finalSize, finalSize);
      ctx.drawImage(offCanvas, -finalSize / 2, -finalSize / 2);
    } else {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, finalSize / 2);
      const rgba = hexToRgba(color, finalOpacity);
      grad.addColorStop(0, rgba);
      grad.addColorStop(Math.min(0.99, brushHardness), rgba);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = grad;
      if (activeBrushId === 'square') {
        ctx.fillRect(-finalSize / 2, -finalSize / 2, finalSize, finalSize);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, finalSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  // Smudge logic
  const paintSmudge = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, pressure: number) => {
    if (!smudgeBuffer.current) return;
    const finalSize = size * (pressure + 0.2);
    const strength = smudgeStrength * (pressure + 0.5);

    ctx.save();
    ctx.globalAlpha = Math.min(strength, 1.0);
    
    // Draw the sampled buffer back onto current position
    // We use a clip to simulate the brush shape
    ctx.beginPath();
    if (activeBrushId === 'square') {
      ctx.rect(x - finalSize / 2, y - finalSize / 2, finalSize, finalSize);
    } else {
      ctx.arc(x, y, finalSize / 2, 0, Math.PI * 2);
    }
    ctx.clip();
    
    ctx.drawImage(smudgeBuffer.current, x - finalSize / 2, y - finalSize / 2, finalSize, finalSize);
    ctx.restore();

    // Refresh smudge buffer: Sample current canvas state for next step
    const sCtx = smudgeBuffer.current.getContext('2d')!;
    sCtx.clearRect(0, 0, finalSize, finalSize);
    sCtx.drawImage(ctx.canvas, x - finalSize / 2, y - finalSize / 2, finalSize, finalSize, 0, 0, finalSize, finalSize);
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const startInteraction = (e: React.PointerEvent) => {
    setContextMenu(null);

    // Check if clicking a guide
    if (activeTool === ToolType.MOVE) {
       const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
       const canvasX = (e.clientX - rect.left) * (canvasSize.width / rect.width);
       const canvasY = (e.clientY - rect.top) * (canvasSize.height / rect.height);
       
       const foundGuide = guides.find(g => {
         const threshold = 10 / zoom;
         return g.type === 'v' ? Math.abs(g.pos - canvasX) < threshold : Math.abs(g.pos - canvasY) < threshold;
       });

       if (foundGuide) {
         setActiveGuideId(foundGuide.id);
         return;
       }
    }

    if (activeTool === ToolType.HAND || isSpacePressed || e.button === 1) {
      setIsPanning(true);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const activeLayer = getActiveLayer();
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) return;
    if (activeTool === ToolType.MOVE) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasSize.width / rect.width);
    const y = (e.clientY - rect.top) * (canvasSize.height / rect.height);

    if (activeTool === ToolType.PICKER) {
      sampleColor(x, y);
      setIsDrawing(true);
      return;
    }

    if (activeTool === ToolType.FILL) {
        // Flood fill implementation
        return;
    }

    if (activeTool === ToolType.SMUDGE) {
      // Initialize smudge buffer
      if (!smudgeBuffer.current) {
        smudgeBuffer.current = document.createElement('canvas');
      }
      smudgeBuffer.current.width = brushSize * 2;
      smudgeBuffer.current.height = brushSize * 2;
      const sCtx = smudgeBuffer.current.getContext('2d')!;
      sCtx.drawImage(activeLayer.canvas, x - brushSize / 2, y - brushSize / 2, brushSize, brushSize, 0, 0, brushSize, brushSize);
    }

    setIsDrawing(true);
    lastSmoothPos.current = { x, y };
    brushDistanceCounter.current = 0;
    
    if (activeTool === ToolType.BRUSH || activeTool === ToolType.ERASER) {
      paintStamp(activeLayer.ctx, x, y, brushSize, brushColor, brushOpacity, e.pressure || 0.5);
    }
    setLayers([...layers]);
  };

  const handleInteraction = (e: React.PointerEvent) => {
    if (activeGuideId) {
      const rect = (viewportRef.current as HTMLElement).getBoundingClientRect();
      const rulerSize = showRulers ? 20 : 0;
      const contentW = rect.width - rulerSize;
      const contentH = rect.height - rulerSize;
      
      const canvasX = (e.clientX - rect.left - rulerSize - contentW / 2 - canvasOffset.x) / zoom + canvasSize.width / 2;
      const canvasY = (e.clientY - rect.top - rulerSize - contentH / 2 - canvasOffset.y) / zoom + canvasSize.height / 2;

      const outThreshold = 30;
      if (e.clientX < rect.left + rulerSize - outThreshold || e.clientY < rect.top + rulerSize - outThreshold) {
        setGuides(prev => prev.filter(g => g.id !== activeGuideId));
        setActiveGuideId(null);
        return;
      }

      setGuides(prev => prev.map(g => {
        if (g.id === activeGuideId) {
          return { ...g, pos: g.type === 'v' ? canvasX : canvasY };
        }
        return g;
      }));
      return;
    }

    if (isPanning) {
      if (lastPanPos.current) {
        const dx = e.clientX - lastPanPos.current.x;
        const dy = e.clientY - lastPanPos.current.y;
        setCanvasOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastPanPos.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    if (!isDrawing) return;
    const activeLayer = getActiveLayer();
    if (!activeLayer) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    
    const targetX = (e.clientX - rect.left) * (canvasSize.width / rect.width);
    const targetY = (e.clientY - rect.top) * (canvasSize.height / rect.height);

    if (activeTool === ToolType.PICKER) {
      sampleColor(targetX, targetY);
      return;
    }

    const weight = 1 - Math.pow(brushSmoothing, 1.5);
    const smoothX = lastSmoothPos.current ? lastSmoothPos.current.x * (1 - weight) + targetX * weight : targetX;
    const smoothY = lastSmoothPos.current ? lastSmoothPos.current.y * (1 - weight) + targetY * weight : targetY;

    if (lastSmoothPos.current) {
      const dx = smoothX - lastSmoothPos.current.x;
      const dy = smoothY - lastSmoothPos.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(1, brushSize * brushSpacing);
      
      brushDistanceCounter.current += dist;
      
      if (brushDistanceCounter.current >= step) {
        const stepsCount = Math.floor(brushDistanceCounter.current / step);
        for (let i = 0; i < stepsCount; i++) {
          const ratio = (i + 1) / stepsCount;
          const px = lastSmoothPos.current.x + dx * ratio;
          const py = lastSmoothPos.current.y + dy * ratio;
          
          if (activeTool === ToolType.BRUSH || activeTool === ToolType.ERASER) {
            paintStamp(activeLayer.ctx, px, py, brushSize, brushColor, brushOpacity, e.pressure || 0.5);
          } else if (activeTool === ToolType.SMUDGE) {
            paintSmudge(activeLayer.ctx, px, py, brushSize, e.pressure || 0.5);
          }
        }
        brushDistanceCounter.current %= step;
      }
    }

    lastSmoothPos.current = { x: smoothX, y: smoothY };
    setLayers([...layers]);
  };

  const stopInteraction = () => {
    setIsDrawing(false);
    setIsPanning(false);
    setActiveGuideId(null);
    lastSmoothPos.current = null;
    lastPanPos.current = null;
    setLayers([...layers]);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const isWorkspace = (e.target as HTMLElement).classList.contains('workspace-area');
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, isWorkspace });
  };

  const handleAIAction = async (type: 'generate' | 'edit') => {
    if (!aiPrompt) return;
    setIsAIGenerating(true);
    try {
      let resultUrl: string | null = null;
      if (type === 'generate') {
        resultUrl = await gemini.generateImage(aiPrompt);
      } else {
        const active = getActiveLayer();
        if (active) {
          resultUrl = await gemini.editImage(active.canvas.toDataURL(), aiPrompt);
        }
      }
      if (resultUrl) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = canvasSize.width;
          canvas.height = canvasSize.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
          const newLayer: Layer = {
            id: Math.random().toString(36).substr(2, 9),
            name: t.layers.aiResult,
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'source-over',
            canvas,
            ctx
          };
          setLayers(prev => [newLayer, ...prev]);
          setActiveLayerId(newLayer.id);
        };
        img.src = resultUrl;
      }
    } finally {
      setIsAIGenerating(false);
    }
  };

  const handleApplyHueSaturation = () => {
    const active = getActiveLayer();
    if (!active) return;
    
    const { width, height } = canvasSize;
    const imageData = active.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] === 0) continue;
      const [h, s, l] = rgbToHsl(data[i], data[i+1], data[i+2]);
      let newH = (h + hueAdjust) % 360;
      if (newH < 0) newH += 360;
      const newS = Math.max(0, Math.min(100, s + satAdjust));
      const newL = Math.max(0, Math.min(100, l + lightAdjust));
      const [r, g, b] = hslToRgb(newH, newS, newL);
      data[i] = r; data[i+1] = g; data[i+2] = b;
    }

    active.ctx.putImageData(imageData, 0, 0);
    setLayers([...layers]);
    setShowHueSatModal(false);
  };

  const handleABRImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const newBrush: BrushPreset = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name.split('.')[0],
          image: img,
          spacing: 0.2,
          hardness: 1.0,
          isCustom: true
        };
        setBrushPresets(prev => [...prev, newBrush]);
        setActiveBrushId(newBrush.id);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCurrentBrushAsPreset = () => {
    const currentActive = brushPresets.find(p => p.id === activeBrushId);
    const newPreset: BrushPreset = {
      id: Math.random().toString(36).substr(2, 9),
      name: `${currentActive?.name || 'Brush'} ${Date.now().toString().slice(-4)}`,
      image: currentActive?.image,
      icon: currentActive?.icon,
      spacing: brushSpacing,
      hardness: brushHardness,
      size: brushSize,
      isCustom: true
    };
    setBrushPresets(prev => [...prev, newPreset]);
    setActiveBrushId(newPreset.id);
  };

  const handleDeleteBrushPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (brushPresets.length <= 1) return;
    setBrushPresets(prev => {
      const filtered = prev.filter(p => p.id !== id);
      if (activeBrushId === id) setActiveBrushId(filtered[0].id);
      return filtered;
    });
  };

  const handleMoveBrush = (id: string, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const index = brushPresets.findIndex(p => p.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === brushPresets.length - 1) return;

    const newPresets = [...brushPresets];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    [newPresets[index], newPresets[targetIdx]] = [newPresets[targetIdx], newPresets[index]];
    setBrushPresets(newPresets);
  };

  const handleBrushIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetIconBrushId) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setBrushPresets(prev => prev.map(p => p.id === targetIconBrushId ? { ...p, icon: base64 } : p));
      setTargetIconBrushId(null);
    };
    reader.readAsDataURL(file);
  };

  // Brush Drag and Drop Handlers
  const handleBrushDragStart = (idx: number) => {
    setDraggedBrushIdx(idx);
  };

  const handleBrushDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleBrushDrop = (targetIdx: number) => {
    if (draggedBrushIdx === null || draggedBrushIdx === targetIdx) return;
    const newPresets = [...brushPresets];
    const [removed] = newPresets.splice(draggedBrushIdx, 1);
    newPresets.splice(targetIdx, 0, removed);
    setBrushPresets(newPresets);
    setDraggedBrushIdx(null);
  };

  const handleRulerMouseDown = (type: 'h' | 'v', e: React.MouseEvent) => {
    const id = Math.random().toString(36).substr(2, 9);
    const rect = (viewportRef.current as HTMLElement).getBoundingClientRect();
    const rulerSize = 20;
    const contentW = rect.width - rulerSize;
    const contentH = rect.height - rulerSize;
    
    const canvasX = (e.clientX - rect.left - rulerSize - contentW / 2 - canvasOffset.x) / zoom + canvasSize.width / 2;
    const canvasY = (e.clientY - rect.top - rulerSize - contentH / 2 - canvasOffset.y) / zoom + canvasSize.height / 2;

    const newGuide: Guide = { id, type, pos: type === 'v' ? canvasX : canvasY };
    setGuides(prev => [...prev, newGuide]);
    setActiveGuideId(id);
  };

  const toggleLanguage = () => setLang(prev => prev === 'en' ? 'zh' : 'en');
  const closeMenus = () => {
    setActiveMenu(null);
    setContextMenu(null);
  };

  const menuData = [
    { id: 'file', label: t.menus.file, items: [
      { label: t.menus.items.new, action: () => addNewLayer() },
      { label: t.menus.items.export, action: handleDownload },
      { label: t.menus.items.exportLayer, action: handleExportSelectedLayer },
      { separator: true },
      { label: t.menus.items.exit, action: () => window.close() },
    ]},
    { id: 'edit', label: t.menus.edit, items: [
        { label: t.menus.items.shortcuts, action: () => setShowShortcutsModal(true) },
    ]},
    { id: 'image', label: t.menus.image, items: [
      { label: t.menus.items.canvasSize, action: () => { setTempCanvasSettings({ ...canvasSize, bgColor: canvasBgColor }); setShowCanvasSettings(true); } },
      { label: t.menus.items.hueSaturation, action: () => { setHueAdjust(0); setSatAdjust(0); setLightAdjust(0); setShowHueSatModal(true); } },
    ]},
    { id: 'view', label: t.menus.view, items: [
      { label: t.menus.items.zoomIn, action: handleZoomIn },
      { label: t.menus.items.zoomOut, action: handleZoomOut },
      { label: t.menus.items.fitScreen, action: handleFitScreen },
      { label: t.menus.items.resetZoom, action: handleResetZoom },
      { separator: true },
      { label: `${showRulers ? '✓ ' : ''}${t.menus.items.showRulers}`, action: () => setShowRulers(!showRulers) },
      { label: t.menus.items.clearGuides, action: () => setGuides([]) },
    ]},
    { id: 'layer', label: t.menus.layer, items: [
      { label: t.menus.items.newLayer, action: () => addNewLayer() },
      { label: t.menus.items.deleteLayer, action: () => initiateRemoveLayer(activeLayerId) },
    ]},
    { id: 'settings', label: t.menus.settings, items: [
      { label: lang === 'en' ? '切换为中文' : 'Switch to English', action: toggleLanguage },
    ]}
  ];

  const previewFilter = useMemo(() => {
    if (!showHueSatModal) return '';
    return `hue-rotate(${hueAdjust}deg) saturate(${100 + satAdjust}%) brightness(${100 + lightAdjust}%)`;
  }, [showHueSatModal, hueAdjust, satAdjust, lightAdjust]);

  const getCursorStyle = useCallback(() => {
    if (activeGuideId) return { cursor: guides.find(g => g.id === activeGuideId)?.type === 'v' ? 'col-resize' : 'row-resize' };
    if (isPanning) return { cursor: 'grabbing' };
    if (activeTool === ToolType.HAND || isSpacePressed) return { cursor: 'grab' };
    if (activeTool === ToolType.PICKER) return { cursor: 'crosshair' };
    if (activeTool === ToolType.MOVE) return { cursor: 'default' };
    
    if (activeTool === ToolType.BRUSH || activeTool === ToolType.ERASER || activeTool === ToolType.SMUDGE) {
      const scaledSize = Math.max(2, brushSize * zoom);
      const radius = scaledSize / 2;
      const center = radius;
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${scaledSize}" height="${scaledSize}" viewBox="0 0 ${scaledSize} ${scaledSize}">
          <circle cx="${center}" cy="${center}" r="${radius - 1}" fill="none" stroke="white" stroke-width="1" stroke-opacity="0.8"/>
          <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="black" stroke-width="1" stroke-opacity="0.5"/>
        </svg>
      `.trim();
      const base64 = btoa(svg);
      return { cursor: `url("data:image/svg+xml;base64,${base64}") ${center} ${center}, crosshair` };
    }

    return { cursor: 'crosshair' };
  }, [activeTool, brushSize, zoom, isPanning, isSpacePressed, activeGuideId, guides]);

  return (
    <div className="flex h-screen w-screen bg-[#121212] text-gray-300 overflow-hidden select-none flex-col" onClick={closeMenus}>
      {/* Hidden inputs */}
      <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={handleBrushIconChange} />
      <input ref={workspaceColorRef} type="color" className="hidden" onChange={(e) => setWorkspaceColor(e.target.value)} />
      
      {/* Menu Bar */}
      <nav className="h-8 bg-[#1e1e1e] border-b border-[#2a2a2a] flex items-center px-2 z-[100] relative">
        <div className="flex items-center h-full">
            {menuData.map((menu) => (
                <div key={menu.id} className="relative h-full flex items-center" onMouseEnter={() => activeMenu && setActiveMenu(menu.id)}>
                    <button className={`px-3 h-full text-[11px] font-medium hover:bg-[#333] transition-colors ${activeMenu === menu.id ? 'bg-[#333] text-orange-500' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === menu.id ? null : menu.id); }}>
                        {menu.label}
                    </button>
                    {activeMenu === menu.id && (
                        <div className="absolute top-full left-0 w-48 bg-[#252525] border border-[#333] shadow-2xl rounded-b-md py-1 z-[110] animate-in fade-in slide-in-from-top-1">
                            {menu.items.map((item, idx) => (
                                item.separator ? <div key={idx} className="h-px bg-[#333] my-1 mx-2" /> :
                                <button key={idx} className="w-full text-left px-4 py-1.5 text-[11px] hover:bg-orange-600 hover:text-white transition-colors"
                                    onClick={(e) => { e.stopPropagation(); item.action?.(); closeMenus(); }}>
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
        <div className="ml-auto pr-2 text-[10px] text-gray-500 font-bold uppercase tracking-tighter flex items-center gap-2">
          <span>Photo Monkey Pro</span>
          <Languages size={12} className="cursor-pointer hover:text-white" onClick={toggleLanguage} />
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Toolbar */}
        <aside className="w-16 bg-[#1e1e1e] border-r border-[#2a2a2a] flex flex-col items-center py-4 gap-4 z-50">
            <div className="mb-2 text-orange-500 font-bold text-xl tracking-tighter">PM</div>
            <ToolButton icon={<MousePointer2 size={18} />} active={activeTool === ToolType.MOVE} onClick={() => setActiveTool(ToolType.MOVE)} label={t.tools.move} />
            <ToolButton icon={<Paintbrush size={18} />} active={activeTool === ToolType.BRUSH} onClick={() => setActiveTool(ToolType.BRUSH)} label={t.tools.brush} />
            <ToolButton icon={<Fingerprint size={18} />} active={activeTool === ToolType.SMUDGE} onClick={() => setActiveTool(ToolType.SMUDGE)} label={t.tools.smudge} />
            <ToolButton icon={<Eraser size={18} />} active={activeTool === ToolType.ERASER} onClick={() => setActiveTool(ToolType.ERASER)} label={t.tools.eraser} />
            <ToolButton icon={<PaintBucket size={18} />} active={activeTool === ToolType.FILL} onClick={() => setActiveTool(ToolType.FILL)} label={t.tools.fill} />
            <ToolButton icon={<Pipette size={18} />} active={activeTool === ToolType.PICKER} onClick={() => setActiveTool(ToolType.PICKER)} label={t.tools.picker} />
            <ToolButton icon={<Hand size={18} />} active={activeTool === ToolType.HAND} onClick={() => setActiveTool(ToolType.HAND)} label={t.tools.hand} />
            <ToolButton icon={<Sparkles size={18} />} active={activeTool === ToolType.AI_EDIT} onClick={() => setActiveTool(ToolType.AI_EDIT)} label={t.tools.aiMagic} />
            <div className="mt-auto border-t border-[#2a2a2a] pt-4 w-full flex flex-col items-center gap-4">
              <div className="relative group">
                <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-8 h-8 border-none bg-transparent cursor-pointer rounded-full relative z-10" />
                <div className="absolute inset-0 rounded-full border border-white/20 group-hover:border-orange-500 transition-colors" />
                <div className="absolute top-0 left-full ml-4 bg-black/90 text-white text-[10px] px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all border border-white/10 z-[100] uppercase tracking-widest">{brushColor}</div>
              </div>
              <button onClick={handleDownload} className="p-2 hover:bg-[#2a2a2a] rounded transition-colors" title={t.tools.export}><Download size={18} /></button>
            </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
            <header className="h-10 bg-[#1e1e1e] border-b border-[#2a2a2a] flex items-center px-4 gap-6 z-40 overflow-x-auto custom-scrollbar">
              <div className="flex items-center gap-4 min-w-max">
                  {activeTool === ToolType.BRUSH || activeTool === ToolType.ERASER || activeTool === ToolType.SMUDGE ? (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setShowBrushLib(!showBrushLib); }} className="flex items-center gap-2 bg-[#2a2a2a] border border-[#333] px-3 py-1 rounded text-[10px] hover:bg-[#333] transition-colors">
                        <Paintbrush size={12} className="text-orange-500" /> {t.brushSettings.library}
                      </button>
                      <div className="h-4 w-px bg-[#333]" />
                      <HeaderControl label={t.brushSettings.size} min={1} max={500} value={brushSize} onChange={setBrushSize} />
                      {activeTool === ToolType.SMUDGE ? (
                        <HeaderControl label={t.brushSettings.strength} min={0} max={1} step={0.01} value={smudgeStrength} onChange={setSmudgeStrength} percentage />
                      ) : (
                        <HeaderControl label={t.brushSettings.opacity} min={0} max={1} step={0.01} value={brushOpacity} onChange={setBrushOpacity} percentage />
                      )}
                      <HeaderControl label={t.brushSettings.smoothing} min={0} max={1} step={0.01} value={brushSmoothing} onChange={setBrushSmoothing} percentage />
                      <HeaderControl label={t.brushSettings.spacing} min={0.01} max={1} step={0.01} value={brushSpacing} onChange={setBrushSpacing} percentage />
                      <HeaderControl label={t.brushSettings.hardness} min={0} max={1} step={0.01} value={brushHardness} onChange={setBrushHardness} percentage />
                    </>
                  ) : activeTool === ToolType.FILL ? (
                    <>
                      <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
                        <PaintBucket size={14} /> {t.tools.fill}
                      </span>
                      <div className="h-4 w-px bg-[#333]" />
                      <HeaderControl label={t.brushSettings.tolerance} min={0} max={255} value={fillTolerance} onChange={setFillTolerance} />
                    </>
                  ) : activeTool === ToolType.PICKER ? (
                    <>
                      <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-2">
                        <Pipette size={14} /> {t.tools.picker}
                      </span>
                      <div className="h-4 w-px bg-[#333]" />
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase text-gray-500 font-bold">{t.brushSettings.currentColor}</span>
                        <div className="w-4 h-4 rounded border border-white/20" style={{ backgroundColor: brushColor }} />
                        <span className="text-[10px] font-mono text-gray-400 uppercase">{brushColor}</span>
                      </div>
                    </>
                  ) : activeTool === ToolType.HAND ? (
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Hand size={14} /> {t.tools.hand}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.tools.move}</span>
                  )}
              </div>

              {showBrushLib && (
                <div className="absolute top-12 left-4 w-72 bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[10px] font-black uppercase text-orange-500 tracking-widest">{t.brushSettings.library}</h3>
                    <div className="flex gap-2">
                      <button onClick={handleSaveCurrentBrushAsPreset} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white" title={t.brushSettings.savePreset}>
                        <FilePlus size={14} />
                      </button>
                      <button onClick={() => abrInputRef.current?.click()} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white" title={t.brushSettings.import}>
                        <Upload size={14} />
                      </button>
                    </div>
                    <input ref={abrInputRef} type="file" accept=".abr,image/*" className="hidden" onChange={handleABRImport} />
                  </div>
                  <div className="flex flex-col gap-1 max-h-80 overflow-y-auto custom-scrollbar p-1">
                    {brushPresets.map((brush, index) => (
                      <div 
                        key={brush.id} 
                        draggable
                        onDragStart={() => handleBrushDragStart(index)}
                        onDragOver={handleBrushDragOver}
                        onDrop={() => handleBrushDrop(index)}
                        onClick={() => { 
                          setActiveBrushId(brush.id); 
                          if (brush.spacing !== undefined) setBrushSpacing(brush.spacing);
                          if (brush.hardness !== undefined) setBrushHardness(brush.hardness);
                          if (brush.size !== undefined) setBrushSize(brush.size);
                          setShowBrushLib(false); 
                        }}
                        className={`group relative flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer ${activeBrushId === brush.id ? 'border-orange-500 bg-orange-500/10' : 'border-transparent hover:bg-black/20'} ${draggedBrushIdx === index ? 'opacity-40 grayscale scale-95' : ''}`}>
                        
                        <div className="shrink-0 text-gray-600 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity">
                          <GripVertical size={14} />
                        </div>

                        <div className="w-8 h-8 rounded bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
                          {brush.icon ? <img src={brush.icon} className="w-full h-full object-cover" /> : 
                           brush.image ? <img src={brush.image.src} className="w-full h-full object-contain invert grayscale" /> : 
                           brush.id === 'round' ? <Circle size={16} fill="white" /> : 
                           brush.id === 'soft' ? <Circle size={16} fill="white" className="opacity-40" /> :
                           <div className="w-4 h-4 bg-white" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold truncate text-gray-300 group-hover:text-white">{brush.name}</div>
                          <div className="text-[8px] text-gray-500 uppercase tracking-tighter">S: {brush.spacing} H: {brush.hardness}</div>
                        </div>

                        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); setTargetIconBrushId(brush.id); iconInputRef.current?.click(); }} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-orange-500" title={t.brushSettings.changeIcon}><ImageIcon size={10}/></button>
                          <button onClick={(e) => handleMoveBrush(brush.id, 'up', e)} disabled={index === 0} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white disabled:opacity-20"><ChevronUp size={10}/></button>
                          <button onClick={(e) => handleMoveBrush(brush.id, 'down', e)} disabled={index === brushPresets.length - 1} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white disabled:opacity-20"><ChevronDown size={10}/></button>
                          <button onClick={(e) => handleDeleteBrushPreset(brush.id, e)} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-red-500"><Trash2 size={10}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </header>

            <div 
              ref={viewportRef} 
              onWheel={handleWheel}
              onContextMenu={handleContextMenu}
              style={{ ...getCursorStyle(), backgroundColor: workspaceColor }}
              className="flex-1 overflow-hidden flex relative workspace-area transition-colors duration-200"
            >
              {showRulers && (
                <>
                  <div className="absolute top-0 left-5 right-0 h-5 bg-[#2a2a2a] border-b border-[#3a3a3a] z-[60] overflow-hidden cursor-row-resize" onMouseDown={(e) => handleRulerMouseDown('h', e)}>
                    <Ruler orientation="horizontal" size={canvasSize.width} zoom={zoom} offset={canvasOffset.x} />
                  </div>
                  <div className="absolute top-5 left-0 bottom-0 w-5 bg-[#2a2a2a] border-r border-[#3a3a3a] z-[60] overflow-hidden cursor-col-resize" onMouseDown={(e) => handleRulerMouseDown('v', e)}>
                    <Ruler orientation="vertical" size={canvasSize.height} zoom={zoom} offset={canvasOffset.y} />
                  </div>
                  <div className="absolute top-0 left-0 w-5 h-5 bg-[#2a2a2a] border-r border-b border-[#3a3a3a] z-[60]" />
                </>
              )}

              <div className="flex-1 overflow-hidden relative flex items-center justify-center workspace-area pointer-events-none">
                <div className="relative shadow-2xl checkerboard transition-transform duration-75 ease-out origin-center pointer-events-auto"
                  style={{ 
                    width: canvasSize.width, 
                    height: canvasSize.height, 
                    transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})` 
                  }}
                  onPointerDown={startInteraction} onPointerMove={handleInteraction} onPointerUp={stopInteraction} onPointerLeave={stopInteraction}>
                  {[...layers].reverse().map((layer) => (
                    <CanvasLayer key={layer.id} layer={layer} previewFilter={activeLayerId === layer.id ? previewFilter : ''} />
                  ))}
                  
                  <div className="absolute inset-0 pointer-events-none z-[100]">
                    {guides.map(guide => (
                      <div 
                        key={guide.id} 
                        className={`absolute bg-[#00ffff] pointer-events-auto ${guide.type === 'v' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'}`}
                        style={{ 
                          [guide.type === 'v' ? 'left' : 'top']: `${guide.pos}px`,
                          [guide.type === 'v' ? 'top' : 'left']: '-5000px',
                          [guide.type === 'v' ? 'bottom' : 'right']: '-5000px',
                          height: guide.type === 'v' ? '10000px' : '1px',
                          width: guide.type === 'h' ? '10000px' : '1px',
                          boxShadow: '0 0 1px rgba(0,0,0,0.5)'
                        }}
                      />
                    ))}
                  </div>
                </div>
                <ZoomOverlay zoom={zoom} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onReset={handleResetZoom} />
              </div>
            </div>

            {/* AI Prompt Area */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40">
              <div className="bg-[#1e1e1e]/90 backdrop-blur-md border border-[#333] rounded-2xl shadow-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between text-[10px] font-black text-orange-500 uppercase tracking-widest">
                  <span className="flex items-center gap-1"><Sparkles size={12} /> {t.aiWorkspace.title}</span>
                  {isAIGenerating && <span className="animate-pulse text-gray-400">{t.aiWorkspace.processing}</span>}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder={t.aiWorkspace.placeholder}
                    className="flex-1 bg-[#121212] border border-[#333] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors" />
                  <button onClick={() => handleAIAction('generate')} disabled={isAIGenerating} className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-50">
                    {t.aiWorkspace.generate}
                  </button>
                  <button onClick={() => handleAIAction('edit')} disabled={isAIGenerating} className="bg-[#2a2a2a] hover:bg-[#333] border border-[#333] text-white px-5 py-2 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-50">
                    {t.aiWorkspace.editLayer}
                  </button>
                </div>
              </div>
            </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-72 bg-[#1e1e1e] border-l border-[#2a2a2a] flex flex-col z-50">
            <div className="p-4 border-b border-[#2a2a2a]">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2"><Layers size={14} /> {t.layers.title}</h2>
              <button onClick={() => addNewLayer()} className="w-full py-2 bg-[#2a2a2a] hover:bg-[#333] rounded-xl border border-[#333] text-xs font-bold transition-colors">
                <Plus size={16} className="inline mr-1" /> {t.layers.newLayer}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {layers.map(layer => (
                <div key={layer.id} onClick={() => setActiveLayerId(layer.id)}
                  className={`group flex flex-col p-3 mb-1 rounded-xl cursor-pointer transition-all border ${activeLayerId === layer.id ? 'bg-[#2a2a2a] border-orange-500/50 shadow-lg' : 'hover:bg-[#252525] border-transparent'}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={(e) => { e.stopPropagation(); layer.visible = !layer.visible; setLayers([...layers]); }} className={`p-1.5 rounded-lg hover:bg-black/20 ${!layer.visible ? 'text-gray-600' : 'text-gray-300'}`}>
                      {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <div className="w-12 h-12 bg-black/40 rounded-lg border border-[#333] overflow-hidden"><Thumbnail canvas={layer.canvas} /></div>
                    <div className="flex-1 overflow-hidden">
                      {editingLayerId === layer.id ? 
                        <input autoFocus className="w-full bg-[#121212] border border-orange-500 rounded px-1 text-xs text-white" value={tempLayerName} onChange={(e) => setTempLayerName(e.target.value)}
                          onBlur={() => updateLayerName(layer.id, tempLayerName)} onKeyDown={(e) => e.key === 'Enter' && updateLayerName(layer.id, tempLayerName)} onClick={e => e.stopPropagation()} /> :
                        <div className="text-xs font-bold truncate" onDoubleClick={(e) => { e.stopPropagation(); setEditingLayerId(layer.id); setTempLayerName(layer.name); }}>{layer.name}</div>
                      }
                      <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-tighter">{t.layers.blendModes[layer.blendMode]}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); initiateRemoveLayer(layer.id); }} className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                  {activeLayerId === layer.id && (
                    <div className="mt-3 pt-3 border-t border-[#333] space-y-2" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase text-gray-500 w-12">{t.brushSettings.opacity}</span>
                        <input type="range" min="0" max="1" step="0.01" value={layer.opacity} onChange={(e) => { layer.opacity = parseFloat(e.target.value); setLayers([...layers]); }} className="flex-1 h-1 bg-[#333] rounded accent-orange-600 appearance-none" />
                      </div>
                      <select value={layer.blendMode} onChange={(e) => { layer.blendMode = e.target.value as BlendMode; setLayers([...layers]); }} className="w-full bg-[#121212] border border-[#333] rounded p-1 text-[10px]">
                        {Object.entries(t.layers.blendModes).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
        </aside>
      </div>

      {/* Context Menu Component */}
      {contextMenu && (
        <div 
          className="fixed bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl z-[500] py-2 min-w-[200px] animate-in fade-in zoom-in-95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.isWorkspace ? (
            <div className="px-1 py-1">
               <h4 className="px-3 py-1 text-[9px] uppercase font-bold text-gray-500 tracking-widest mb-1">{t.contextMenu.workspaceColor}</h4>
               {[
                 { label: t.contextMenu.colorBlack, color: '#000000' },
                 { label: t.contextMenu.colorDarkGray, color: '#1a1a1a' },
                 { label: t.contextMenu.colorMediumGray, color: '#2b2b2b' },
                 { label: t.contextMenu.colorLightGray, color: '#444444' },
               ].map(item => (
                 <button key={item.color} onClick={() => { setWorkspaceColor(item.color); setContextMenu(null); }} 
                   className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] hover:bg-orange-600 hover:text-white transition-colors text-left rounded-lg">
                   <span>{item.label}</span>
                   <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: item.color }} />
                 </button>
               ))}
               <div className="h-px bg-[#333] my-1" />
               <button onClick={() => { workspaceColorRef.current?.click(); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-1.5 text-[11px] hover:bg-orange-600 hover:text-white transition-colors text-left rounded-lg">
                  <Palette size={14}/> {t.contextMenu.colorCustom}
               </button>
            </div>
          ) : (
            <>
              {(activeTool === ToolType.BRUSH || activeTool === ToolType.ERASER || activeTool === ToolType.SMUDGE) ? (
                <div className="px-4 py-2 space-y-4">
                  <h4 className="text-[10px] uppercase font-black text-orange-500 tracking-widest flex items-center gap-2"><Settings2 size={12}/> {t.contextMenu.quickBrush}</h4>
                  <div className="space-y-3">
                    <AdjustmentSlider label={t.brushSettings.size} min={1} max={500} value={brushSize} onChange={setBrushSize} />
                    <AdjustmentSlider label={t.brushSettings.hardness} min={0} max={1} step={0.01} value={brushHardness} onChange={setBrushHardness} percentage />
                  </div>
                  <div className="h-px bg-[#333] my-2" />
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                    {brushPresets.map(bp => (
                      <button key={bp.id} onClick={() => { setActiveBrushId(bp.id); setContextMenu(null); }} 
                        className={`w-full aspect-square rounded border transition-all flex items-center justify-center p-1 ${activeBrushId === bp.id ? 'border-orange-500 bg-orange-500/10' : 'border-[#333] hover:border-gray-500'}`}>
                        {bp.icon ? <img src={bp.icon} className="w-full h-full object-cover" /> : <Circle size={16} className={activeBrushId === bp.id ? 'text-orange-500' : 'text-gray-500'} />}
                      </button>
                    ))}
                  </div>
                </div>
              ) : activeTool === ToolType.PICKER ? (
                <div className="px-1 py-1">
                  <button onClick={() => { navigator.clipboard.writeText(brushColor); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2 text-[11px] hover:bg-orange-600 hover:text-white transition-colors text-left rounded-lg">
                    <Pipette size={14}/> {t.contextMenu.copyHex}
                  </button>
                </div>
              ) : (
                <div className="px-1 py-1">
                  <h4 className="px-3 py-1 text-[9px] uppercase font-bold text-gray-500 tracking-widest mb-1">{t.contextMenu.zoomOptions}</h4>
                  <button onClick={() => { handleFitScreen(); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2 text-[11px] hover:bg-orange-600 hover:text-white transition-colors text-left rounded-lg">
                    <Maximize2 size={14}/> {t.contextMenu.fitScreen}
                  </button>
                  <button onClick={() => { handleResetZoom(); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2 text-[11px] hover:bg-orange-600 hover:text-white transition-colors text-left rounded-lg">
                    <Plus size={14}/> {t.contextMenu.actualSize}
                  </button>
                  <button onClick={() => { setCanvasOffset({x:0, y:0}); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2 text-[11px] hover:bg-orange-600 hover:text-white transition-colors text-left rounded-lg">
                    <RotateCw size={14}/> {t.contextMenu.resetView}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {showShortcutsModal && (
        <ShortcutsModal 
          t={t} 
          currentShortcuts={shortcuts} 
          altForPicker={altForPickerEnabled}
          onSave={(newShortcuts, newAltForPicker) => {
            setShortcuts(newShortcuts);
            setAltForPickerEnabled(newAltForPicker);
            localStorage.setItem('pm_shortcuts', JSON.stringify(newShortcuts));
            localStorage.setItem('pm_alt_picker', JSON.stringify(newAltForPicker));
            setShowShortcutsModal(false);
          }} 
          onCancel={() => setShowShortcutsModal(false)}
        />
      )}

      {showHueSatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl max-md w-full p-6 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-orange-500 mb-6"><Sliders size={24} /><h3 className="text-lg font-bold text-gray-100">{t.adjustments.hueSaturation}</h3></div>
            <div className="space-y-6">
              <AdjustmentSlider label={t.adjustments.hue} min={-180} max={180} value={hueAdjust} onChange={setHueAdjust} />
              <AdjustmentSlider label={t.adjustments.saturation} min={-100} max={100} value={satAdjust} onChange={setSatAdjust} />
              <AdjustmentSlider label={t.adjustments.lightness} min={-100} max={100} value={lightAdjust} onChange={setLightAdjust} />
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={handleApplyHueSaturation} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all">{t.adjustments.apply}</button>
              <button onClick={() => setShowHueSatModal(false)} className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all">{t.adjustments.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {showCanvasSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-orange-500 mb-4">{t.canvasSettings.title}</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center"><span className="text-xs text-gray-500">{t.canvasSettings.width}</span><input type="number" value={tempCanvasSettings.width} onChange={e => setTempCanvasSettings({...tempCanvasSettings, width: parseInt(e.target.value)||0})} className="bg-black border border-[#333] rounded px-2 py-1 text-xs w-24" /></div>
              <div className="flex justify-between items-center"><span className="text-xs text-gray-500">{t.canvasSettings.height}</span><input type="number" value={tempCanvasSettings.height} onChange={e => setTempCanvasSettings({...tempCanvasSettings, height: parseInt(e.target.value)||0})} className="bg-black border border-[#333] rounded px-2 py-1 text-xs w-24" /></div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 flex items-center gap-1"><Palette size={12}/> {t.canvasSettings.backgroundColor}</span>
                <input type="color" value={tempCanvasSettings.bgColor} onChange={e => setTempCanvasSettings({...tempCanvasSettings, bgColor: e.target.value})} className="w-8 h-8 bg-transparent border-none cursor-pointer" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowResizeConfirm(true)} className="flex-1 bg-orange-600 text-white py-2 rounded text-xs font-bold">{t.canvasSettings.apply}</button>
              <button onClick={() => setShowCanvasSettings(false)} className="flex-1 bg-[#2a2a2a] text-gray-400 py-2 rounded text-xs font-bold">{t.canvasSettings.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {showResizeConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6 max-w-xs text-center">
            <AlertCircle size={32} className="mx-auto text-orange-500 mb-4" />
            <h4 className="font-bold mb-2">{t.canvasSettings.confirmTitle}</h4>
            <p className="text-xs text-gray-500 mb-6">{t.canvasSettings.confirmMessage}</p>
            <div className="flex gap-2">
              <button onClick={executeResize} className="flex-1 bg-orange-600 text-white py-2 rounded text-xs font-bold">{t.canvasSettings.confirmAction}</button>
              <button onClick={() => setShowResizeConfirm(false)} className="flex-1 bg-[#2a2a2a] text-gray-400 py-2 rounded text-xs font-bold">{t.canvasSettings.cancelAction}</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteLayerConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-[#333] rounded-2xl p-6 max-w-xs text-center animate-in zoom-in-95">
            <AlertCircle size={32} className="mx-auto text-red-500 mb-4" />
            <h4 className="font-bold mb-2 text-gray-100">{t.layerSettings.confirmDeleteTitle}</h4>
            <p className="text-xs text-gray-500 mb-6">{t.layerSettings.confirmDeleteMessage}</p>
            <div className="flex gap-2">
              <button onClick={executeRemoveLayer} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded text-xs font-bold transition-colors">{t.layerSettings.deleteAction}</button>
              <button onClick={() => { setShowDeleteLayerConfirm(false); setLayerToDeleteId(null); }} className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-gray-400 py-2 rounded text-xs font-bold transition-colors">{t.layerSettings.cancelAction}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Subcomponents ---

const ShortcutsModal: React.FC<{ t: any, currentShortcuts: ShortcutMap, altForPicker: boolean, onSave: (s: ShortcutMap, a: boolean) => void, onCancel: () => void }> = ({ t, currentShortcuts, altForPicker, onSave, onCancel }) => {
  const [localShortcuts, setLocalShortcuts] = useState<ShortcutMap>({ ...currentShortcuts });
  const [localAltForPicker, setLocalAltForPicker] = useState(altForPicker);
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<'tools' | 'menu'>('tools');

  const categories = [
    { id: 'tools', label: t.shortcuts.tools, icon: <Palette size={14}/> },
    { id: 'menu', label: t.shortcuts.application, icon: <Layers size={14}/> }
  ];

  const actionsByCat = {
    tools: [
      { id: 'TOOL_MOVE', label: t.tools.move },
      { id: 'TOOL_BRUSH', label: t.tools.brush },
      { id: 'TOOL_SMUDGE', label: t.tools.smudge },
      { id: 'TOOL_ERASER', label: t.tools.eraser },
      { id: 'TOOL_FILL', label: t.tools.fill },
      { id: 'TOOL_PICKER', label: t.tools.picker },
      { id: 'TOOL_HAND', label: t.tools.hand },
    ],
    menu: [
      { id: 'MENU_NEW', label: t.menus.items.new },
      { id: 'MENU_SAVE', label: t.menus.items.save },
      { id: 'MENU_EXPORT', label: t.menus.items.export },
      { id: 'ZOOM_IN', label: t.menus.items.zoomIn },
      { id: 'ZOOM_OUT', label: t.menus.items.zoomOut },
      { id: 'FIT_SCREEN', label: t.menus.items.fitScreen },
      { id: 'TOGGLE_RULERS', label: t.menus.items.showRulers },
    ]
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!editingAction) return;
    e.preventDefault();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(e.key.toLowerCase());
    const combo = parts.join('+');

    setLocalShortcuts(prev => ({ ...prev, [editingAction]: combo }));
    setEditingAction(null);
  };

  useEffect(() => {
    if (editingAction) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [editingAction]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[600] flex items-center justify-center p-4">
      <div className="bg-[#1e1e1e] border border-[#333] rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col h-[600px] overflow-hidden animate-in zoom-in-95">
        <header className="p-6 border-b border-[#2a2a2a] flex justify-between items-center bg-[#252525]">
          <h2 className="text-lg font-black text-gray-100 uppercase tracking-widest flex items-center gap-2"><Keyboard className="text-orange-500" /> {t.shortcuts.title}</h2>
          <button onClick={onCancel} className="p-2 hover:bg-[#333] rounded-full transition-colors"><X size={20}/></button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-52 border-r border-[#2a2a2a] bg-[#1a1a1a] p-2 space-y-1">
            {categories.map(cat => (
              <button 
                key={cat.id} 
                onClick={() => setActiveCategory(cat.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeCategory === cat.id ? 'bg-orange-600 text-white shadow-lg' : 'hover:bg-[#252525] text-gray-400'}`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </aside>

          <main className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#1e1e1e]">
            <div className="mb-8 p-4 bg-[#252525] rounded-xl border border-[#333]">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={localAltForPicker} 
                  onChange={(e) => setLocalAltForPicker(e.target.checked)}
                  className="w-4 h-4 accent-orange-600"
                />
                <span className="text-xs font-bold text-gray-200">{t.shortcuts.altForEyedropper}</span>
              </label>
            </div>

            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-gray-500 border-b border-[#333]">
                  <th className="pb-4 font-black uppercase tracking-widest">{t.shortcuts.command}</th>
                  <th className="pb-4 font-black uppercase tracking-widest">{t.shortcuts.shortcut}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {actionsByCat[activeCategory].map(action => {
                  const isEditing = editingAction === action.id;
                  const currentKeys = localShortcuts[action.id] || '';
                  
                  // Simple conflict check
                  const isConflict = Object.entries(localShortcuts).some(([id, combo]) => combo === currentKeys && id !== action.id);

                  return (
                    <tr key={action.id} className="group hover:bg-black/10">
                      <td className="py-4 text-gray-300 font-medium">{action.label}</td>
                      <td className="py-4">
                        <button 
                          onClick={() => setEditingAction(action.id)}
                          className={`min-w-[120px] px-3 py-2 rounded-lg border text-center font-mono transition-all ${
                            isEditing ? 'bg-orange-600/20 border-orange-500 text-orange-500 shadow-inner' : 
                            isConflict ? 'border-red-500/50 bg-red-500/10 text-red-500' :
                            'border-[#333] bg-[#252525] group-hover:border-[#444] text-gray-400'
                          }`}
                        >
                          {isEditing ? t.shortcuts.pressKey : currentKeys || '—'}
                        </button>
                        {isConflict && !isEditing && <span className="ml-2 text-[10px] text-red-500 opacity-60">{t.shortcuts.conflict}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </main>
        </div>

        <footer className="p-6 border-t border-[#2a2a2a] bg-[#252525] flex justify-between items-center">
           <button onClick={() => { setLocalShortcuts(DEFAULT_SHORTCUTS); setLocalAltForPicker(true); }} className="text-xs text-gray-500 hover:text-orange-500 font-bold uppercase transition-colors">{t.shortcuts.reset}</button>
           <div className="flex gap-3">
              <button onClick={onCancel} className="px-6 py-2.5 rounded-xl bg-[#333] hover:bg-[#444] text-xs font-bold transition-all">{t.shortcuts.cancel}</button>
              <button onClick={() => onSave(localShortcuts, localAltForPicker)} className="px-8 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-lg active:scale-95 transition-all">{t.shortcuts.save}</button>
           </div>
        </footer>
      </div>
    </div>
  );
};

const Ruler: React.FC<{ orientation: 'horizontal' | 'vertical', size: number, zoom: number, offset: number }> = ({ orientation, size, zoom, offset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#444';
    const isH = orientation === 'horizontal';
    const contentDim = isH ? rect.width : rect.height;
    const center = contentDim / 2 + offset;
    const startCanvasPixel = -center / zoom;
    const endCanvasPixel = (contentDim - center) / zoom;
    const baseIntervals = [1, 5, 10, 50, 100, 500, 1000, 5000];
    let interval = 100;
    for (const b of baseIntervals) {
      if (b * zoom >= 50) { interval = b; break; }
    }
    const startVal = Math.floor(startCanvasPixel / interval) * interval;
    const endVal = Math.ceil(endCanvasPixel / interval) * interval;
    for (let val = startVal; val <= endVal; val += interval) {
      const pos = val * zoom + center;
      if (pos < 0 || pos > contentDim) continue;
      if (isH) {
        ctx.beginPath(); ctx.moveTo(pos, 10); ctx.lineTo(pos, 20); ctx.stroke();
        ctx.fillText(val.toString(), pos, 5);
      } else {
        ctx.save(); ctx.translate(5, pos); ctx.rotate(-Math.PI / 2); ctx.fillText(val.toString(), 0, 0); ctx.restore();
        ctx.beginPath(); ctx.moveTo(10, pos); ctx.lineTo(20, pos); ctx.stroke();
      }
      const subInterval = interval / 5;
      for (let s = 1; s < 5; s++) {
        const subVal = val + s * subInterval;
        const subPos = subVal * zoom + center;
        if (subPos < 0 || subPos > contentDim) continue;
        ctx.beginPath();
        if (isH) { ctx.moveTo(subPos, 15); ctx.lineTo(subPos, 20); }
        else { ctx.moveTo(15, subPos); ctx.lineTo(20, subPos); }
        ctx.stroke();
      }
    }
  }, [orientation, size, zoom, offset]);
  return <canvas ref={canvasRef} className="w-full h-full" />;
};

const HeaderControl: React.FC<{ label: string, min: number, max: number, value: number, onChange: (v: number) => void, step?: number, percentage?: boolean }> = ({ label, min, max, value, onChange, step = 1, percentage }) => (
  <div className="flex items-center gap-2">
    <span className="text-[9px] uppercase text-gray-500 font-bold">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-20 h-1 bg-[#333] rounded accent-orange-600 appearance-none" />
    <span className="text-[10px] font-mono text-gray-400 w-8">{percentage ? Math.round(value * 100) + '%' : value}</span>
  </div>
);

const ToolButton: React.FC<{ icon: React.ReactNode, active: boolean, onClick: () => void, label: string }> = ({ icon, active, onClick, label }) => (
  <button onClick={onClick} className={`p-3 rounded-2xl transition-all relative group ${active ? 'bg-orange-600 text-white shadow-xl scale-110 z-10' : 'hover:bg-[#2a2a2a] text-gray-400'}`} title={label}>
    {icon}
    <div className="absolute left-full ml-4 bg-black/90 text-white text-[10px] px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all border border-white/10 z-[100]">{label}</div>
  </button>
);

const CanvasLayer: React.FC<{ layer: Layer, previewFilter?: string }> = ({ layer, previewFilter }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const update = () => {
      ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(layer.canvas, 0, 0);
      requestAnimationFrame(update);
    };
    const anim = requestAnimationFrame(update);
    return () => cancelAnimationFrame(anim);
  }, [layer.canvas]);
  return (
    <canvas ref={canvasRef} width={layer.canvas.width} height={layer.canvas.height} style={{ filter: previewFilter, mixBlendMode: layer.blendMode as any }}
      className={`absolute inset-0 pointer-events-none ${!layer.visible ? 'hidden' : ''}`} />
  );
};

const Thumbnail: React.FC<{ canvas: HTMLCanvasElement }> = ({ canvas }) => {
  const thumbRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const update = () => {
      if (!thumbRef.current) return;
      const ctx = thumbRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, 100, 100);
      ctx.drawImage(canvas, 0, 0, 100, 100);
      setTimeout(update, 1000);
    };
    update();
  }, [canvas]);
  return <canvas ref={thumbRef} width={100} height={100} className="w-full h-full object-contain" />;
};

const ZoomOverlay: React.FC<{ zoom: number, onZoomIn: () => void, onZoomOut: () => void, onReset: () => void }> = ({ zoom, onZoomIn, onZoomOut, onReset }) => (
  <div className="absolute bottom-6 right-6 flex items-center bg-[#1e1e1e]/80 backdrop-blur border border-[#333] rounded-full p-1 shadow-xl z-50">
    <button onClick={onZoomOut} className="p-1.5 hover:bg-[#333] rounded-full transition-colors text-gray-400 hover:text-white"><Minus size={14} /></button>
    <button onClick={onReset} className="px-2 py-1 text-[9px] font-mono hover:bg-[#333] rounded-lg min-w-[50px] text-center">{(zoom * 100).toFixed(0)}%</button>
    <button onClick={onZoomIn} className="p-1.5 hover:bg-[#333] rounded-full transition-colors text-gray-400 hover:text-white"><Plus size={14} /></button>
  </div>
);

const AdjustmentSlider: React.FC<{ label: string, min: number, max: number, value: number, onChange: (v: number) => void, step?: number, percentage?: boolean }> = ({ label, min, max, value, onChange, step = 1, percentage }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-gray-500"><span>{label}</span><span className="font-mono text-gray-300">{percentage ? Math.round(value*100) + '%' : value}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-[#333] rounded-lg appearance-none accent-orange-600" />
  </div>
);

export default App;
