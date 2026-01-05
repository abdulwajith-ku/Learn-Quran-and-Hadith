
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  QURAN = 'QURAN',
  HIFZ = 'HIFZ',
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
  maskedVerse: string;
  missingWords: string[];
  tips: string;
  tajweedRules: string;
  tartilGuidance: string;
}
