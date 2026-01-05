
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

export const analyzeArabicGrammar = async (input: string | { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `Perform a deep linguistic and grammatical analysis of this Quranic verse.
  1. Root Words (வேர்ச் சொற்கள்): Extract the 3-letter roots for key words and explain their core meanings.
  2. Grammar (இலக்கணம்): Explain the Nahw (sentence structure) and Sarf (word morphology) in simple terms.
  3. Learning Tips: Provide 3-4 specific tips on how to learn these Arabic patterns using English and Tamil grammar analogies.
  Provide the output in a clean Markdown format with clear headings. Use both English and Tamil for explanations.`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: `${prompt}\n\nVerse: ${input}` }] }
    : { parts: [{ text: prompt }, { inlineData: input }] };

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents,
    config: {
      thinkingConfig: { thinkingBudget: 32768 }
    }
  });

  return response.text;
};

export const analyzeHifzChallenge = async (input: string | { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `You are an expert Quran Hifz (memorization) and Tajweed coach. Analyze the following verse and provide guidance:
  1. Provide the original Arabic verse.
  2. Provide a 'maskedVerse' where 3-4 key words are replaced with '____'.
  3. List the 'missingWords' in order.
  4. Provide 'tips' in Tamil and English for memorizing this specific verse.
  5. Provide 'tajweedRules' (தஜ்வீத் விதிகள்) specific to this verse in Tamil and English.
  6. Provide 'tartilGuidance' (தர்த்தீல் வழிகாட்டுதல்) on how to recite with proper melody and pace in Tamil and English.
  Return JSON.`;

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
          maskedVerse: { type: Type.STRING },
          missingWords: { type: Type.ARRAY, items: { type: Type.STRING } },
          tips: { type: Type.STRING },
          tajweedRules: { type: Type.STRING },
          tartilGuidance: { type: Type.STRING }
        },
        required: ["originalVerse", "maskedVerse", "missingWords", "tips", "tajweedRules", "tartilGuidance"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const verifyRecitation = async (verseText: string, audioData: { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `Compare this audio recitation against the target Quranic verse: "${verseText}".
  Check for:
  1. Accuracy (any skipped or wrong words).
  2. Basic Tajweed suggestions (Ghunnah, Mad, Qalqalah etc).
  Provide feedback in a clear format with both Tamil (தமிழ்) and English. Highlight specific areas of improvement. Be encouraging.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { text: prompt },
        { inlineData: audioData }
      ]
    }
  });

  return response.text;
};

export const translateQuranVerse = async (input: string | { data: string; mimeType: string }) => {
  const ai = getAI();
  const prompt = `Provide a full detailed translation and explanation for this Quran verse in both Tamil and English. 
  Structure it as:
  1. Full English Translation
  2. Full Tamil Translation (தமிழ் விளக்கம்)
  3. Brief Context/Benefit (பயன்)`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: `${prompt}\n\nVerse: ${input}` }] }
    : { parts: [{ text: prompt }, { inlineData: input }] };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents
  });

  return response.text;
};

export const generateSpeech = async (text: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
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
