
import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Mic, 
  LayoutDashboard, 
  Settings,
  Menu,
  X,
  ChevronRight,
  Upload,
  Loader2,
  Volume2,
  Square,
  Languages,
  MessageSquareQuote,
  HardDrive,
  BrainCircuit,
  GraduationCap,
  History,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Layers,
  PlayCircle,
  HelpCircle,
  CheckCircle2,
  Info,
  FileText,
  Image as ImageIcon,
  Sparkles,
  ArrowRightCircle,
  ListChecks
} from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { AppView, QuranWord, HifzChallenge } from './types';
import { 
  analyzeQuranVerse, 
  translateQuranVerse, 
  analyzeArabicGrammar,
  generateSpeech,
  analyzeHifzChallenge,
  verifyRecitation,
  extractTextForReading
} from './services/geminiService';

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>(AppView.DASHBOARD);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Feature states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Global Audio states
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Quran state
  const [quranInput, setQuranInput] = useState('');
  const [quranResult, setQuranResult] = useState<QuranWord[]>([]);
  const [quranFullTranslation, setQuranFullTranslation] = useState<string | null>(null);
  const [quranGrammar, setQuranGrammar] = useState<string | null>(null);
  const [quranPayload, setQuranPayload] = useState<any>(null);
  const [selectedQuranFileSize, setSelectedQuranFileSize] = useState<number | null>(null);
  const [hideTamilMeanings, setHideTamilMeanings] = useState(false);
  const [hideEnglishMeanings, setHideEnglishMeanings] = useState(false);
  const [peekIndices, setPeekIndices] = useState<Set<string>>(new Set());

  // Hifz state
  const [hifzInput, setHifzInput] = useState('');
  const [hifzChallenge, setHifzChallenge] = useState<HifzChallenge | null>(null);
  const [hifzPayload, setHifzPayload] = useState<any>(null);
  const [selectedHifzFileSize, setSelectedHifzFileSize] = useState<number | null>(null);
  const [hifzMaskedIndices, setHifzMaskedIndices] = useState<Set<number>>(new Set());
  const [recitationFeedback, setRecitationFeedback] = useState<string | null>(null);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{data: string, mimeType: string} | null>(null);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Optimized Audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const stopTTS = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) { /* Already stopped */ }
      audioSourceRef.current = null;
    }
    setPlayingId(null);
  };

  const playTTS = async (text: string, id: string) => {
    stopTTS();
    setPlayingId(id);
    const ctx = getAudioContext();
    try {
      const base64Audio = await generateSpeech(text);
      if (!base64Audio || playingId === 'STOPPED') {
        setPlayingId(null);
        return;
      }
      const binary = atob(base64Audio);
      const dataInt16 = new Int16Array(binary.length / 2);
      const view = new DataView(new Uint8Array(Array.from(binary, c => c.charCodeAt(0))).buffer);
      for (let i = 0; i < dataInt16.length; i++) {
        dataInt16[i] = view.getInt16(i * 2, true);
      }
      const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackSpeed;
      source.connect(ctx.destination);
      source.onended = () => {
        if (playingId === id) setPlayingId(null);
      };
      audioSourceRef.current = source;
      source.start();
    } catch (err) {
      console.error("Audio playback error:", err);
      setPlayingId(null);
    }
  };

  const handleReadAloud = async (text: string, payload: any, id: string) => {
    if (playingId === id) {
      stopTTS();
      return;
    }

    setLoading(true);
    try {
      let textToRead = text;
      if (payload) {
        textToRead = await extractTextForReading(payload);
      }
      
      if (!textToRead || textToRead.trim().length === 0) {
        throw new Error("No text found to read aloud.");
      }

      await playTTS(textToRead, id);
    } catch (err: any) {
      setError(err.message || "Failed to read aloud.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let interval: number;
    if (loading) {
      setUploadProgress(0);
      interval = window.setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) return prev;
          return prev + Math.random() * 10;
        });
      }, 300);
    } else {
      setUploadProgress(100);
      const timeout = window.setTimeout(() => setUploadProgress(0), 1000);
      return () => window.clearTimeout(timeout);
    }
    return () => window.clearInterval(interval);
  }, [loading]);

  const toggleWordMask = (index: number) => {
    const newMask = new Set(hifzMaskedIndices);
    if (newMask.has(index)) newMask.delete(index);
    else newMask.add(index);
    setHifzMaskedIndices(newMask);
  };

  const randomMaskHifz = () => {
    if (!hifzChallenge) return;
    const words = hifzChallenge.originalVerse.split(/\s+/);
    const newMask = new Set<number>();
    words.forEach((_, i) => {
      if (Math.random() < 0.35) newMask.add(i);
    });
    setHifzMaskedIndices(newMask);
  };

  const clearMaskHifz = () => setHifzMaskedIndices(new Set());

  const togglePeek = (rowIdx: number, col: string) => {
    const key = `${rowIdx}-${col}`;
    const newPeek = new Set(peekIndices);
    if (newPeek.has(key)) newPeek.delete(key);
    else newPeek.add(key);
    setPeekIndices(newPeek);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedBlobUrl(url);
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setRecordedAudio({ data: base64, mimeType: 'audio/webm' });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError("Microphone access denied or error occurred.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const resetHifz = () => {
    setHifzInput('');
    setHifzChallenge(null);
    setHifzPayload(null);
    setSelectedHifzFileSize(null);
    setRecitationFeedback(null);
    setRecordedAudio(null);
    setRecordedBlobUrl(null);
    setIsRecording(false);
    setHifzMaskedIndices(new Set());
  };

  const resetQuran = () => {
    setQuranInput('');
    setQuranResult([]);
    setQuranFullTranslation(null);
    setQuranGrammar(null);
    setQuranPayload(null);
    setSelectedQuranFileSize(null);
    setPeekIndices(new Set());
  };

  const handleAction = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const processFile = async (file: File): Promise<{ data: any; type: 'inline' | 'text' }> => {
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type === 'text/csv';
    const isWord = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');

    if (isPdf || isImage) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          resolve({ data: { data: base64, mimeType: file.type }, type: 'inline' });
        };
        reader.readAsDataURL(file);
      });
    }

    if (isExcel) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          let fullText = "";
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            fullText += `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}\n\n`;
          });
          resolve({ data: fullText, type: 'text' });
        };
        reader.readAsArrayBuffer(file);
      });
    }

    if (isWord) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { data: result.value, type: 'text' };
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({ data: e.target?.result as string, type: 'text' });
      };
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, onProcessed: (payload: any, name: string, size: number) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const result = await processFile(file);
      onProcessed(result.data, file.name, file.size);
    } catch (err: any) {
      setError(`Failed to process file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const ProgressBar = ({ progress, color = 'bg-indigo-600' }: { progress: number, color?: string }) => (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4 shadow-inner">
      <div 
        className={`h-full ${color} transition-all duration-300 ease-out flex items-center justify-end px-2`}
        style={{ width: `${progress}%` }}
      >
        {progress > 10 && <div className="w-1 h-1 bg-white/50 rounded-full animate-pulse" />}
      </div>
    </div>
  );

  const SpeedSelector = () => (
    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
      <Zap size={14} className="text-amber-400 ml-1 mr-1" />
      {[0.5, 1, 1.5, 2].map(speed => (
        <button
          key={speed}
          onClick={() => setPlaybackSpeed(speed)}
          className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${playbackSpeed === speed ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {speed}x
        </button>
      ))}
    </div>
  );

  const renderContent = () => {
    switch (activeView) {
      case AppView.DASHBOARD:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 animate-in fade-in duration-500">
            <FeatureCard 
              title="Quran Word-by-Word" 
              desc="Break down verses with transliteration and Tamil meanings."
              icon={<BookOpen className="w-8 h-8 text-emerald-600" />}
              onClick={() => setActiveView(AppView.QURAN)}
            />
             <FeatureCard 
              title="Quran Hifz Helper" 
              desc="Challenge your memory, record recitation & get Tajweed tips."
              icon={<GraduationCap className="w-8 h-8 text-purple-600" />}
              onClick={() => setActiveView(AppView.HIFZ)}
            />
            <FeatureCard 
              title="Tutorial & Demo" 
              desc="Watch how to use the AI tools effectively with a guided video."
              icon={<PlayCircle className="w-8 h-8 text-blue-600" />}
              onClick={() => setActiveView(AppView.TUTORIAL)}
            />
          </div>
        );

      case AppView.TUTORIAL:
        return (
          <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4">
            <header className="text-center space-y-3">
              <div className="inline-block p-3 bg-blue-100 rounded-full text-blue-600 mb-2">
                <Sparkles size={32} />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900">Learn to Master the AI Tools</h2>
              <p className="text-slate-500 max-w-2xl mx-auto text-lg">Your step-by-step guide to using image uploads, document analysis, and AI hifz coaching.</p>
            </header>

            <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border-8 border-slate-800 relative group aspect-video flex items-center justify-center">
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10" />
               <div className="text-center z-20 space-y-6">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-blue-600 blur-2xl opacity-40 animate-pulse" />
                    <button className="relative w-24 h-24 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl transform transition-all group-hover:scale-110 active:scale-95 border-4 border-white/20">
                      <PlayCircle size={56} fill="currentColor" className="ml-1" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <p className="text-white font-black text-2xl tracking-tight uppercase">Platform Walkthrough</p>
                    <p className="text-blue-300 font-medium">Learn Word-by-Word & Hifz Tools in 5 Minutes</p>
                  </div>
               </div>
               <div className="absolute bottom-6 left-6 right-6 z-20 flex justify-between items-center text-white/60 text-xs font-bold uppercase tracking-widest">
                  <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> HD DEMO</div>
                  <div className="bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">Duration: 04:12</div>
               </div>
               <div className="absolute inset-0 opacity-50 bg-[url('https://images.unsplash.com/photo-1519491050282-cf00c82424b4?auto=format&fit=crop&q=80&w=1200')] bg-cover bg-center" />
            </div>

            <div className="space-y-6">
              <h3 className="text-2xl font-bold flex items-center gap-3 text-slate-800">
                <ListChecks className="text-blue-600" /> Key Feature Guides
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TutorialStep 
                  number="1"
                  title="Analysis via Upload"
                  color="emerald"
                  icon={<ImageIcon className="text-emerald-600" />}
                  desc="Take a photo of any Quranic page or upload a PDF. Our AI automatically extracts the Arabic text and breaks it into a word-by-word grid with Tamil meanings."
                  actionLabel="Try Analysis"
                  onAction={() => setActiveView(AppView.QURAN)}
                />
                <TutorialStep 
                  number="2"
                  title="Hifz Memory Challenge"
                  color="purple"
                  icon={<GraduationCap className="text-purple-600" />}
                  desc="Paste a verse or upload your study material. Use 'Mask Mode' to hide words and test your recall. Record your voice to get AI-powered Tajweed feedback."
                  actionLabel="Go to Hifz"
                  onAction={() => setActiveView(AppView.HIFZ)}
                />
                <TutorialStep 
                  number="3"
                  title="Tamil Translations"
                  color="indigo"
                  icon={<Languages className="text-indigo-600" />}
                  desc="Get deep grammatical analysis (Root words) and full contextual translations in Tamil and English with just one click."
                  actionLabel="View Analysis"
                  onAction={() => setActiveView(AppView.QURAN)}
                />
                <TutorialStep 
                  number="4"
                  title="Global Read Aloud"
                  color="blue"
                  icon={<Volume2 className="text-blue-600" />}
                  desc="Listen to any text on the platform. Adjust playback speed (0.5x to 2x) to follow along at your own pace. Perfect for learning pronunciation."
                  actionLabel="Check Settings"
                  onAction={() => setActiveView(AppView.DASHBOARD)}
                />
              </div>
            </div>

            <div className="bg-slate-100 border border-slate-200 p-8 rounded-[2rem] flex flex-col md:flex-row items-center gap-8">
               <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center shrink-0">
                 <HelpCircle size={40} className="text-slate-400" />
               </div>
               <div className="flex-1 space-y-2 text-center md:text-left">
                 <h4 className="text-xl font-bold text-slate-800">Still have questions?</h4>
                 <p className="text-slate-500 text-sm">Our AI is designed to be intuitive. Simply hover over any icon to see its function, or try uploading a sample file to see it in action.</p>
               </div>
               <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                 <button onClick={() => setActiveView(AppView.DASHBOARD)} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">Back to Home</button>
                 <button onClick={() => setActiveView(AppView.QURAN)} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md">Launch Quran Helper</button>
               </div>
            </div>
          </div>
        );

      case AppView.QURAN:
        return (
          <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-2xl font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BookOpen className="text-emerald-600" /> Quran Arabic, Tamil & English Analysis
              </span>
              <button 
                onClick={resetQuran}
                className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all font-bold"
              >
                <Trash2 size={14} /> CLEAR ALL
              </button>
            </h2>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              {loading && uploadProgress > 0 && <ProgressBar progress={uploadProgress} color="bg-emerald-500" />}
              <div className="relative">
                <textarea 
                  className="w-full p-4 border rounded-xl h-32 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Type a Quran verse or paste text here..."
                  value={quranInput}
                  onChange={(e) => {
                    setQuranInput(e.target.value);
                    setQuranPayload(null);
                    setSelectedQuranFileSize(null);
                  }}
                />
                <button
                  onClick={() => handleReadAloud(quranInput, quranPayload, 'quran-input-read')}
                  disabled={loading && playingId !== 'quran-input-read'}
                  className={`absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-all ${
                    playingId === 'quran-input-read' 
                      ? 'bg-red-600 text-white animate-pulse' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  } disabled:opacity-50`}
                  title={playingId === 'quran-input-read' ? "Stop Reading" : "Read Aloud"}
                >
                  {playingId === 'quran-input-read' ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  disabled={loading || (!quranInput && !quranPayload)}
                  onClick={() => handleAction(async () => {
                    const result = await analyzeQuranVerse(quranPayload || quranInput);
                    setQuranResult(result);
                    setQuranFullTranslation(null);
                    setQuranGrammar(null);
                    setPeekIndices(new Set());
                  })}
                  className="flex-1 bg-emerald-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <BookOpen size={20} />}
                  Word-by-Word
                </button>
                <button 
                  disabled={loading || (!quranInput && !quranPayload)}
                  onClick={() => handleAction(async () => {
                    const translation = await translateQuranVerse(quranPayload || quranInput);
                    setQuranFullTranslation(translation);
                    setQuranGrammar(null);
                  })}
                  className="flex-1 bg-indigo-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Languages size={20} />}
                  Translate to Tamil
                </button>
                <button 
                  disabled={loading || (!quranInput && !quranPayload)}
                  onClick={() => handleAction(async () => {
                    const grammar = await analyzeArabicGrammar(quranPayload || quranInput);
                    setQuranGrammar(grammar);
                    setQuranFullTranslation(null);
                  })}
                  className="flex-1 bg-teal-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Layers size={20} />}
                  Root & Grammar
                </button>
                <label className="flex-1 cursor-pointer bg-slate-100 text-slate-700 py-3 px-4 rounded-xl font-medium hover:bg-slate-200 transition-all flex items-center justify-center gap-2 relative">
                  <Upload size={20} />
                  <div className="flex flex-col items-center">
                    <span>Upload Image/Doc</span>
                    {selectedQuranFileSize !== null && (
                      <span className="text-[10px] opacity-60 flex items-center gap-1 font-bold text-emerald-700">
                        <HardDrive size={10} /> {formatBytes(selectedQuranFileSize)}
                      </span>
                    )}
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*,application/pdf,.xlsx,.xls,.docx"
                    onChange={(e) => handleFileUpload(e, (payload, name, size) => {
                      setQuranPayload(payload);
                      setQuranInput(`File: ${name}`);
                      setSelectedQuranFileSize(size);
                    })}
                  />
                </label>
              </div>
            </div>

            {quranFullTranslation && (
              <div className="bg-emerald-50 p-8 rounded-2xl shadow-sm border border-emerald-100 animate-in fade-in slide-in-from-top-4">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
                    <MessageSquareQuote size={24} /> Full Translation & Benefit
                  </h3>
                  <div className="flex gap-2">
                    {playingId === 'quran-full' ? (
                      <button onClick={stopTTS} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200">
                        <Square size={20} fill="currentColor" />
                      </button>
                    ) : (
                      <button 
                        onClick={() => playTTS(quranFullTranslation, 'quran-full')} 
                        disabled={playingId !== null}
                        className="p-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50"
                      >
                        {playingId === 'quran-full' ? <Loader2 className="animate-spin" size={20} /> : <Volume2 size={20} />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">{quranFullTranslation}</div>
              </div>
            )}

            {quranResult.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 bg-slate-900 text-white p-4 rounded-xl shadow-md border border-slate-800 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Study Mode:</span>
                    <button onClick={() => setHideTamilMeanings(!hideTamilMeanings)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${hideTamilMeanings ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                      {hideTamilMeanings ? <EyeOff size={14} /> : <Eye size={14} />}
                      {hideTamilMeanings ? 'TAMIL HIDDEN' : 'HIDE TAMIL'}
                    </button>
                    <button onClick={() => setHideEnglishMeanings(!hideEnglishMeanings)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${hideEnglishMeanings ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                      {hideEnglishMeanings ? <EyeOff size={14} /> : <Eye size={14} />}
                      {hideEnglishMeanings ? 'ENGLISH HIDDEN' : 'HIDE ENGLISH'}
                    </button>
                  </div>
                  <div className="hidden sm:block h-6 w-[1px] bg-slate-800 mx-2" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Audio Speed:</span>
                    <SpeedSelector />
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Arabic</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Transliteration</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Tamil Meaning</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">English Meaning</th>
                          <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">Audio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {quranResult.map((word, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-quran text-3xl text-slate-800">{word.arabic}</td>
                            <td className="px-6 py-4 text-slate-600 italic">{word.transliteration}</td>
                            <td className={`px-6 py-4 font-medium transition-all cursor-pointer ${hideTamilMeanings && !peekIndices.has(`${idx}-ta`) ? 'bg-slate-100/50 text-transparent select-none blur-sm hover:blur-none' : 'text-slate-800'}`} onClick={() => hideTamilMeanings && togglePeek(idx, 'ta')}>{word.tamilMeaning}</td>
                            <td className={`px-6 py-4 transition-all cursor-pointer ${hideEnglishMeanings && !peekIndices.has(`${idx}-en`) ? 'bg-slate-100/50 text-transparent select-none blur-sm hover:blur-none' : 'text-slate-700'}`} onClick={() => hideEnglishMeanings && togglePeek(idx, 'en')}>{word.englishMeaning}</td>
                            <td className="px-6 py-4 text-center">
                              <button onClick={() => playingId === `word-${idx}` ? stopTTS() : playTTS(`${word.transliteration}. English: ${word.englishMeaning}. Tamil: ${word.tamilMeaning}`, `word-${idx}`)} className={`p-2 rounded-full transition-colors ${playingId === `word-${idx}` ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                                {playingId === `word-${idx}` ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case AppView.HIFZ:
        return (
          <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <GraduationCap className="text-purple-600" /> Quran Hifz Companion & Coaching
              </h2>
              <div className="flex gap-2">
                <button onClick={resetHifz} className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all font-bold">
                  <Trash2 size={14} /> CLEAR ALL
                </button>
              </div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <BookOpen size={18} className="text-purple-500" /> Start Memorizing
                  </h3>
                  {loading && uploadProgress > 0 && <ProgressBar progress={uploadProgress} color="bg-purple-500" />}
                  <div className="relative">
                    <textarea 
                      className="w-full p-4 border rounded-xl h-24 focus:ring-2 focus:ring-purple-500 outline-none text-right font-quran text-2xl bg-slate-50" 
                      placeholder="Paste Arabic verse or upload image..." 
                      value={hifzInput} 
                      onChange={(e) => {
                        setHifzInput(e.target.value);
                        setHifzPayload(null);
                        setSelectedHifzFileSize(null);
                      }} 
                    />
                    <button
                      onClick={() => handleReadAloud(hifzInput, hifzPayload, 'hifz-input-read')}
                      disabled={loading && playingId !== 'hifz-input-read'}
                      className={`absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-all ${
                        playingId === 'hifz-input-read' 
                          ? 'bg-red-600 text-white animate-pulse' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      } disabled:opacity-50`}
                      title={playingId === 'hifz-input-read' ? "Stop Reading" : "Read Aloud"}
                    >
                      {playingId === 'hifz-input-read' ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                      disabled={loading || (!hifzInput && !hifzPayload)} 
                      onClick={() => handleAction(async () => { 
                        const challenge = await analyzeHifzChallenge(hifzPayload || hifzInput); 
                        setHifzChallenge(challenge); 
                        setHifzMaskedIndices(new Set()); 
                      })} 
                      className="flex-[2] bg-purple-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit size={18} />} AI Hifz Analysis
                    </button>
                    <label className="flex-1 cursor-pointer bg-slate-100 text-slate-700 py-3 px-4 rounded-xl font-medium hover:bg-slate-200 transition-all flex items-center justify-center gap-2 relative">
                      <Upload size={20} />
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-sm">Upload Image/Doc</span>
                        {selectedHifzFileSize !== null && (
                          <span className="text-[10px] opacity-60 flex items-center gap-1 font-bold text-purple-700">
                            <HardDrive size={10} /> {formatBytes(selectedHifzFileSize)}
                          </span>
                        )}
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*,application/pdf,.xlsx,.xls,.docx"
                        onChange={(e) => handleFileUpload(e, (payload, name, size) => {
                          setHifzPayload(payload);
                          setHifzInput(`Selected: ${name}`);
                          setSelectedHifzFileSize(size);
                        })}
                      />
                    </label>
                  </div>
                </div>
                {hifzChallenge && (
                  <div className="space-y-4 animate-in fade-in duration-500">
                    <div className="bg-purple-900 text-white p-8 rounded-2xl shadow-xl space-y-8 border-t-4 border-purple-500">
                      <div className="flex flex-col items-center gap-6">
                        <span className="text-xs font-bold uppercase tracking-widest text-purple-300 bg-purple-800/50 px-3 py-1 rounded-full">Recitation Workspace</span>
                        <div className="flex flex-wrap flex-row-reverse gap-4 justify-center items-center w-full" dir="rtl">
                          {hifzChallenge.originalVerse.split(/\s+/).map((word, idx) => (
                            <button key={idx} onClick={() => toggleWordMask(idx)} className={`font-quran text-4xl leading-loose px-4 py-2 rounded-xl transition-all duration-200 ${hifzMaskedIndices.has(idx) ? 'bg-purple-800/30 text-purple-300/50 border-2 border-dashed border-purple-700 blur-[2px]' : 'bg-white/10 text-white border-2 border-white/5 hover:bg-white/20 hover:scale-105 active:scale-95'}`}>
                              {hifzMaskedIndices.has(idx) ? '____' : word}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="pt-8 border-t border-purple-800 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <button onClick={randomMaskHifz} className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded-xl text-xs font-bold transition-all shadow-md"><RefreshCw size={14} /> AUTO MASK (30%)</button>
                          <button onClick={clearMaskHifz} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all shadow-md"><Eye size={14} /> REVEAL ALL</button>
                          <div className="h-6 w-[1px] bg-purple-800 mx-2" />
                          <SpeedSelector />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="lg:col-span-1 space-y-6">
                {hifzChallenge ? (
                  <>
                    <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm animate-in slide-in-from-right-4">
                      <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-3"><Settings size={18} className="text-amber-600" /> Tajweed Rules</h4>
                      <div className="text-amber-800 text-sm leading-relaxed whitespace-pre-wrap">{hifzChallenge.tajweedRules}</div>
                    </div>
                  </>
                ) : (
                  <div className="h-full bg-slate-100 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                    <History size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-bold">Upload an Image of a Verse</p>
                    <p className="text-xs mt-1">AI will extract the text and start your session</p>
                  </div>
                )}
              </div>
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl space-y-4">
                  <h3 className="font-bold flex items-center gap-2 text-red-400"><Mic size={18} /> Record & Verify</h3>
                  <div className="space-y-6">
                    <div className="flex flex-col items-center gap-4 py-4">
                      <button onClick={isRecording ? stopRecording : startRecording} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-red-600 hover:bg-red-700'}`}>
                        {isRecording ? <Square size={24} fill="white" /> : <Mic size={32} className="text-white" />}
                      </button>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{isRecording ? 'Recording...' : 'Start Reciting'}</span>
                    </div>
                    {recordedBlobUrl && !isRecording && (
                      <div className="p-4 bg-slate-800 rounded-xl space-y-3">
                         <button onClick={() => handleAction(async () => { if (recordedAudio) setRecitationFeedback(await verifyRecitation(hifzInput, recordedAudio)); })} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all">
                           {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit size={14} />} AI Verify Accuracy
                         </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-50 bg-white border-r transition-all duration-300 ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 overflow-hidden'}`}>
        <div className="h-full w-64 flex flex-col">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3"><div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white"><Settings /></div><h1 className="font-bold text-xl">Gemini Pro</h1></div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
          </div>
          <nav className="flex-1 px-4 space-y-2 mt-4">
            <SidebarItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeView === AppView.DASHBOARD} onClick={() => setActiveView(AppView.DASHBOARD)} />
            <div className="py-4 px-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Tools</div>
            <SidebarItem icon={<BookOpen size={20} />} label="Quran Helper" active={activeView === AppView.QURAN} onClick={() => setActiveView(AppView.QURAN)} />
            <SidebarItem icon={<GraduationCap size={20} />} label="Hifz Companion" active={activeView === AppView.HIFZ} onClick={() => setActiveView(AppView.HIFZ)} />
            <SidebarItem icon={<PlayCircle size={20} />} label="Tutorial" active={activeView === AppView.TUTORIAL} onClick={() => setActiveView(AppView.TUTORIAL)} />
          </nav>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <header className="h-16 bg-white border-b sticky top-0 z-30 flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">{sidebarOpen ? <X size={24} /> : <Menu size={24} />}</button>
            <h2 className="font-semibold text-slate-700 truncate">
              {activeView === AppView.DASHBOARD ? "Main Dashboard" : 
               activeView === AppView.QURAN ? "Quranic Analysis" : 
               activeView === AppView.HIFZ ? "Hifz Helper" : "Interactive Tutorial"}
            </h2>
          </div>
          <div className="flex items-center gap-4"><div className="h-8 w-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs">GP</div></div>
        </header>
        {error && <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 animate-in fade-in">Error: {error}</div>}
        <main className="flex-1 overflow-y-auto">{renderContent()}</main>
      </div>
    </div>
  );
};

const FeatureCard: React.FC<{ title: string; desc: string; icon: React.ReactNode; onClick: () => void }> = ({ title, desc, icon, onClick }) => (
  <button onClick={onClick} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-left flex flex-col gap-4 group">
    <div className="p-4 bg-slate-50 rounded-2xl group-hover:bg-slate-100 transition-colors inline-block w-fit">{icon}</div>
    <div><h3 className="text-lg font-bold text-slate-800">{title}</h3><p className="text-slate-500 text-sm mt-1 leading-relaxed">{desc}</p></div>
    <div className="mt-4 flex items-center gap-2 text-indigo-600 font-semibold text-sm">Launch Tool <ChevronRight size={16} /></div>
  </button>
);

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
    {icon}<span className="font-medium whitespace-nowrap">{label}</span>
  </button>
);

const TutorialStep: React.FC<{ number: string; title: string; color: string; icon: React.ReactNode; desc: string; actionLabel: string; onAction: () => void }> = ({ number, title, color, icon, desc, actionLabel, onAction }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:shadow-md transition-shadow group">
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl bg-${color}-100 flex items-center justify-center font-bold text-${color}-700 shrink-0`}>{number}</div>
      <h4 className="text-xl font-bold text-slate-800">{title}</h4>
      <div className="ml-auto opacity-40 group-hover:opacity-100 transition-opacity">{icon}</div>
    </div>
    <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    <button onClick={onAction} className={`flex items-center gap-2 text-sm font-bold text-${color}-600 hover:gap-3 transition-all`}>
      {actionLabel} <ArrowRightCircle size={16} />
    </button>
  </div>
);

export default App;
