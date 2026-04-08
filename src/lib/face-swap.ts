import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function swapFaces(sourceBase64: string, targetBase64: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            inlineData: {
              data: sourceBase64.split(",")[1],
              mimeType: "image/jpeg",
            },
          },
          {
            inlineData: {
              data: targetBase64.split(",")[1],
              mimeType: "image/jpeg",
            },
          },
          {
            text: "Perform a high-quality face swap. Take the face from the first image and replace the face in the second image with it. Ensure the lighting, skin tone, and expression are blended perfectly. Return only the resulting image.",
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/jpeg;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image returned from Gemini");
  } catch (error) {
    console.error("Face swap error:", error);
    throw error;
  }
}
