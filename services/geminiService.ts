
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const extractTextForReading = async (input: string | { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `Extract only the raw text content from this input. If it is a Quran mushaf image or PDF, transcribe the full Arabic text followed by a clear Tamil and English summary. Provide only raw text for display.`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: `${prompt}\n\nContent: ${input}` }] }
    : { parts: [{ text: prompt }, { inlineData: input }] };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents
  });

  return response.text || "";
};

export const analyzeQuranVerse = async (input: string | { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `Analyze this Quran verse. Split it word-by-word. For each word, provide:
  - arabic: The Arabic script
  - transliteration: Latin phonetics
  - tamilMeaning: Precise Tamil meaning
  - englishMeaning: Precise English meaning
  Return as a JSON array of objects.`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: `${prompt}\n\nVerse: ${input}` }] }
    : { parts: [{ text: prompt }, { inlineData: input }] };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            arabic: { type: Type.STRING },
            transliteration: { type: Type.STRING },
            tamilMeaning: { type: Type.STRING },
            englishMeaning: { type: Type.STRING }
          },
          required: ["arabic", "transliteration", "tamilMeaning", "englishMeaning"]
        }
      }
    }
  });

  return JSON.parse(response.text || '[]');
};

export const analyzeHifzChallenge = async (input: string | { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `Provide professional Quran Hifz coaching for this verse. 
  Include Tajweed rules, memorization tips, and recitation advice in both Tamil and English.
  Return as JSON.`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: `${prompt}\n\nVerse: ${input}` }] }
    : { parts: [{ text: prompt }, { inlineData: input }] };

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 2000 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          originalVerse: { type: Type.STRING },
          tipsTamil: { type: Type.STRING },
          tipsEnglish: { type: Type.STRING },
          tajweedTamil: { type: Type.STRING },
          tajweedEnglish: { type: Type.STRING },
          tartilTamil: { type: Type.STRING },
          tartilEnglish: { type: Type.STRING }
        },
        required: ["originalVerse", "tipsTamil", "tipsEnglish", "tajweedTamil", "tajweedEnglish", "tartilTamil", "tartilEnglish"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const verifyRecitation = async (verseText: string, audioData: { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `Audit this recitation against: "${verseText}". Provide feedback in Tamil and English with an accuracy score 0-100.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { text: prompt },
        { inlineData: audioData }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          feedbackTamil: { type: Type.STRING },
          feedbackEnglish: { type: Type.STRING },
          accuracyScore: { type: Type.NUMBER }
        },
        required: ["feedbackTamil", "feedbackEnglish", "accuracyScore"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const generateSpeech = async (text: string) => {
  const ai = getAI();
  const prompt = `Recite with professional Tajweed and correct articulation: ${text}`;
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
