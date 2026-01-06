

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  QURAN = 'QURAN',
  HIFZ = 'HIFZ',
  TAFSIR = 'TAFSIR', // New Tafsir View
  TUTORIAL = 'TUTORIAL'
}

export interface QuranWord {
  arabic: string;
  transliteration: string;
  tamilMeaning: string;
  englishMeaning: string;
}

export interface HifzChallenge {
  originalVerse: string;
  tipsTamil: string;
  tipsEnglish: string;
  tajweedTamil: string;
  tajweedEnglish: string;
  tartilTamil: string;
  tartilEnglish: string;
}

export interface RecitationFeedback {
  feedbackTamil: string;
  feedbackEnglish: string;
  accuracyScore: number;
}

// New interface for Tafsir results
export interface TafsirResult {
  tamilTafsir: string;
  englishTafsir: string;
}