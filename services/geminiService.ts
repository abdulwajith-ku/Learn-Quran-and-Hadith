
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";

// Use direct initialization from process.env.API_KEY as per guidelines
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const extractTextForReading = async (input: string | { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `Extract only the text content from this input. If it is a Quran verse, provide the full Arabic text followed by its simple meaning. Do not include any JSON or metadata. Just raw text for a screen reader.`;

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
  const prompt = `Analyze this Quran verse. Split it word-by-word. For each word, provide the Arabic text, transliteration, precise Tamil meaning, and precise English meaning. 
  Return only JSON format that matches the following schema.`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: `${prompt}\n\nVerse Content: ${input}` }] }
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
  const prompt = `You are an expert Quran Hifz (memorization) and Tajweed coach. Analyze the following verse and provide guidance.
  Provide separate fields for Tamil and English for all explanations.
  
  Return JSON with:
  1. originalVerse: Full Arabic text.
  2. tipsTamil: Memorization tips in Tamil.
  3. tipsEnglish: Memorization tips in English.
  4. tajweedTamil: Detailed Tajweed rules in Tamil.
  5. tajweedEnglish: Detailed Tajweed rules in English.
  6. tartilTamil: Recitation guidance in Tamil.
  7. tartilEnglish: Recitation guidance in English.`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: `${prompt}\n\nVerse: ${input}` }] }
    : { parts: [{ text: prompt }, { inlineData: input }] };

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 4000 },
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
  const prompt = `Compare this audio recitation against the target Quranic verse: "${verseText}".
  Return JSON with:
  1. feedbackTamil: Correction and encouragement in Tamil.
  2. feedbackEnglish: Correction and encouragement in English.
  3. accuracyScore: Number from 0 to 100.`;

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
  // Instruction to ensure Tajweed is applied to the recitation
  const tajweedInstruction = `Recite the following Arabic text with professional Tajweed, correct Makharij (articulation points), and proper Sifat (attributes). Ensure clarity and reverence: ${text}`;
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: tajweedInstruction }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          // 'Kore' is a good clear voice, but we emphasize Tajweed in the prompt
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
