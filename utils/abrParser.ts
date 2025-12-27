
/**
 * Photoshop .abr (Brush) File Parser
 * Supports extracting sampled brush bitmaps (textures) from version 6+ files.
 */

export interface ParsedBrush {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

export async function parseAbr(arrayBuffer: ArrayBuffer): Promise<ParsedBrush[]> {
  const data = new DataView(arrayBuffer);
  const brushes: ParsedBrush[] = [];
  
  // Basic check for Photoshop ABR header
  // Version 1, 2, 6, 10 are common. We focus on 6+ (Sampled Brushes)
  const version = data.getInt16(0);
  
  // Find "samp" (Sampled brushes) or search for 8BIM sections
  // This is a simplified search for the bitmap data segments common in ABR files
  const bytes = new Uint8Array(arrayBuffer);
  let offset = 0;

  // Scan for 'samp' marker which identifies sampled brush data in version 6+
  // and '8BIM' which is the standard Photoshop resource block prefix
  while (offset < bytes.length - 4) {
    // Look for 'samp'
    if (bytes[offset] === 115 && bytes[offset+1] === 97 && bytes[offset+2] === 109 && bytes[offset+3] === 112) {
      const sectionOffset = offset + 4;
      try {
        const result = parseSampledSection(data, sectionOffset, bytes);
        if (result) brushes.push(...result);
      } catch (e) {
        console.error("Error parsing ABR section at", offset, e);
      }
    }
    offset++;
  }

  return brushes;
}

function parseSampledSection(view: DataView, offset: number, bytes: Uint8Array): ParsedBrush[] | null {
  // Photoshop ABR format is complex and uses Descriptors (binary property lists).
  // This is a heuristic approach to find the bitmap data within a sampled section.
  
  const sectionBrushes: ParsedBrush[] = [];
  let currentPos = offset;
  
  // Search for the next '8BIM' block or 'null' terminated name
  // Standard ABRs often store the brush as a series of grayscale bytes 
  // following metadata. We look for patterns of width/height/depth.
  
  // For the sake of this implementation, we look for common sampled brush structures:
  // Usually: Name (Unicode) -> Depth (4 bytes) -> Bounds (4x4 bytes) -> Compressed (1 byte) -> Data
  
  // Advanced ABR parsing is beyond a single file scope, 
  // so we implement a search for the bitmap headers.
  
  // Pattern search for grayscale bitmap blocks
  let i = offset;
  while (i < bytes.length - 20) {
    // Look for depth 8 (0x0008) or 16 (0x0010)
    const depth = view.getUint16(i);
    if (depth === 8 || depth === 1) {
      const top = view.getInt32(i + 2);
      const left = view.getInt32(i + 6);
      const bottom = view.getInt32(i + 10);
      const right = view.getInt32(i + 14);
      
      const h = bottom - top;
      const w = right - left;
      
      // Sanity check for dimensions (e.g., 1x1 to 5000x5000)
      if (w > 0 && w < 5000 && h > 0 && h < 5000) {
        const compression = bytes[i + 18]; // 0 = raw, 1 = RLE
        const dataStart = i + 19;
        
        if (compression === 0) {
          // Raw grayscale data
          const pixelCount = w * h;
          if (dataStart + pixelCount <= bytes.length) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            const imageData = ctx.createImageData(w, h);
            
            for (let p = 0; p < pixelCount; p++) {
              const val = bytes[dataStart + p];
              // Invert for brush (black pixels in ABR are opacity 255)
              imageData.data[p * 4] = 0;
              imageData.data[p * 4 + 1] = 0;
              imageData.data[p * 4 + 2] = 0;
              imageData.data[p * 4 + 3] = 255 - val;
            }
            
            ctx.putImageData(imageData, 0, 0);
            sectionBrushes.push({
              name: `Imported Brush ${w}x${h}`,
              dataUrl: canvas.toDataURL(),
              width: w,
              height: h
            });
            i += 20 + pixelCount; // Jump past data
            continue;
          }
        }
      }
    }
    i++;
  }

  return sectionBrushes.length > 0 ? sectionBrushes : null;
}
