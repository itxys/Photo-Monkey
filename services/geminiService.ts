
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  /**
   * Helper to downscale image if it's too large to prevent RPC payload errors.
   */
  private async downscaleImage(base64: string, maxDim: number = 1024): Promise<{ data: string, mimeType: string }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height *= maxDim / width;
            width = maxDim;
          } else {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const mimeType = dataUrl.split(';')[0].split(':')[1];
        const data = dataUrl.split(',')[1];
        resolve({ data, mimeType });
      };
      img.src = base64;
    });
  }

  /**
   * Generates a new image based on a prompt.
   */
  async generateImage(prompt: string, aspectRatio: "1:1" | "4:3" | "16:9" | "3:4" | "9:16" = "1:1"): Promise<string | null> {
    try {
      // Fix: Follow guidelines for GoogleGenAI initialization by using process.env.API_KEY directly
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio
          }
        }
      });

      if (!response.candidates?.[0]?.content?.parts) return null;

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (error) {
      console.error("AI Generation Error:", error);
      return null;
    }
  }

  /**
   * Edits an existing image using a prompt.
   */
  async editImage(base64Image: string, prompt: string): Promise<string | null> {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.GEMINI_API_KEY });
      // Downscale to prevent "Rpc failed due to xhr error" which often occurs with large payloads
      const { data, mimeType } = await this.downscaleImage(base64Image);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data,
                mimeType
              }
            },
            { text: prompt }
          ]
        }
      });

      if (!response.candidates?.[0]?.content?.parts) return null;

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (error) {
      console.error("AI Editing Error:", error);
      return null;
    }
  }
}

export const gemini = new GeminiService();
