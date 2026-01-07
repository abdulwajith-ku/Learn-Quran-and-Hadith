
import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Mic, 
  LayoutDashboard, 
  Settings,
  Menu,
  X,
  Upload,
  Loader2,
  Volume2,
  Square,
  BrainCircuit,
  GraduationCap,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  HelpCircle,
  ArrowRightCircle,
  MicOff,
  RotateCcw,
  Share2,
  Clipboard,
  Languages,
  MessageCircle,
  Headphones,
  Info,
  FileText // Added missing icon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AppView, QuranWord, HifzChallenge, RecitationFeedback, TafsirResult } from './types';
import { 
  analyzeQuranVerse, 
  generateSpeech,
  analyzeHifzChallenge,
  verifyRecitation,
  extractTextForReading,
  generateTafsir
} from './services/geminiService';

// Live API Helpers
const decode = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
};

const encode = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>(AppView.DASHBOARD);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  // Quran Lab state
  const [quranInput, setQuranInput] = useState('');
  const [quranResult, setQuranResult] = useState<QuranWord[]>([]);
  const [quranPayload, setQuranPayload] = useState<any>(null);
  const [quranFilePreview, setQuranFilePreview] = useState<{type: 'image' | 'text', content: string} | null>(null);
  const [hideTamilQuran, setHideTamilQuran] = useState(false);
  const [hideEnglishQuran, setHideEnglishQuran] = useState(false);
  const [peekIndices, setPeekIndices] = useState<Set<string>>(new Set());

  // Memorization Studio state
  const [hifzInput, setHifzInput] = useState('');
  const [hifzChallenge, setHifzChallenge] = useState<HifzChallenge | null>(null);
  const [hifzPayload, setHifzPayload] = useState<any>(null);
  const [hifzFilePreview, setHifzFilePreview] = useState<{type: 'image' | 'text', content: string} | null>(null);
  const [hifzMaskedIndices, setHifzMaskedIndices] = useState<Set<string>>(new Set());
  const [recitationFeedback, setRecitationFeedback] = useState<RecitationFeedback | null>(null);

  // Tafsir Lab state
  const [tafsirInput, setTafsirInput] = useState('');
  const [tafsirResult, setTafsirResult] = useState<TafsirResult | null>(null);
  const [tafsirPayload, setTafsirPayload] = useState<any>(null);
  const [tafsirFilePreview, setTafsirFilePreview] = useState<{type: 'image' | 'text', content: string} | null>(null);
  const [hideTamilTafsir, setHideTamilTafsir] = useState(false);
  const [hideEnglishTafsir, setHideEnglishTafsir] = useState(false);
  const [playingTafsirId, setPlayingTafsirId] = useState<string | null>(null);
  
  // Voice states
  const [isRecording, setIsRecording] = useState(false);
  const [isDictating, setIsDictating] = useState<string | null>(null);
  const [dictationLang, setDictationLang] = useState<'ar-SA' | 'ta-IN'>('ar-SA');
  const [recordedAudio, setRecordedAudio] = useState<{data: string, mimeType: string} | null>(null);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  
  // Continuous Dictation Logic
  const isActuallyDictatingRef = useRef<boolean>(false);
  const dictatingTargetRef = useRef<string | null>(null);
  const baselineTextRef = useRef<string>('');
  const latestValueRef = useRef<string>('');
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Live AI Studio (Voice-to-Voice)
  const [liveActive, setLiveActive] = useState(false);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);

  useEffect(() => { latestValueRef.current = quranInput; }, [quranInput]);
  useEffect(() => { latestValueRef.current = hifzInput; }, [hifzInput]);
  useEffect(() => { latestValueRef.current = tafsirInput; }, [tafsirInput]);

  // Clean up voice on unmount or view change
  useEffect(() => {
    return () => {
      stopLiveSession();
      if (isActuallyDictatingRef.current) toggleDictation(null as any);
    };
  }, [activeView]);

  // Audio Engine for TTS
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    return audioContextRef.current;
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    setPlayingId(null);
    setPlayingTafsirId(null);
  };

  // Add missing playRecitation function
  const playRecitation = async (text: string, id: string) => {
    setPlayingId(id);
    try {
      const audioData = await generateSpeech(text);
      if (!audioData) {
        setPlayingId(null);
        return;
      }
      const ctx = getAudioContext();
      const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setPlayingId(prev => prev === id ? null : prev);
      };
      audioSourceRef.current = source;
      source.start();
    } catch (err) {
      setPlayingId(null);
      setError("Failed to play recitation.");
    }
  };

  const resetLab = () => {
    stopAudio();
    stopLiveSession();
    setQuranInput('');
    setQuranResult([]);
    setQuranPayload(null);
    setQuranFilePreview(null);
    setHifzInput('');
    setHifzChallenge(null);
    setHifzPayload(null);
    setHifzFilePreview(null);
    setTafsirInput('');
    setTafsirResult(null);
    setTafsirPayload(null);
    setTafsirFilePreview(null);
    if (isActuallyDictatingRef.current) toggleDictation(dictatingTargetRef.current as any);
  };

  // Add missing resetQuran function
  const resetQuran = () => {
    stopAudio();
    setQuranInput('');
    setQuranResult([]);
    setQuranPayload(null);
    setQuranFilePreview(null);
    setPeekIndices(new Set());
  };

  const toggleDictation = (target: 'quran' | 'hifz' | 'tafsir') => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice recognition is not supported in this browser.");
      return;
    }

    // Toggle logic
    if (isActuallyDictatingRef.current && dictatingTargetRef.current === target) {
      isActuallyDictatingRef.current = false;
      dictatingTargetRef.current = null;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch (e) {}
        recognitionRef.current = null;
      }
      setIsDictating(null);
      return;
    }

    // Stop current if switching targets
    if (isActuallyDictatingRef.current) {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    }

    isActuallyDictatingRef.current = true;
    dictatingTargetRef.current = target;
    setIsDictating(target);
    baselineTextRef.current = latestValueRef.current;

    const createRecognition = () => {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = dictationLang;

      rec.onresult = (event: any) => {
        let sessionTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          sessionTranscript += event.results[i][0].transcript;
        }
        
        const cleanBaseline = baselineTextRef.current.trim();
        const combined = cleanBaseline ? `${cleanBaseline} ${sessionTranscript.trim()}` : sessionTranscript.trim();
        
        if (target === 'quran') setQuranInput(combined);
        else if (target === 'hifz') setHifzInput(combined);
        else if (target === 'tafsir') setTafsirInput(combined);
      };

      rec.onend = () => {
        if (isActuallyDictatingRef.current && dictatingTargetRef.current === target) {
          baselineTextRef.current = latestValueRef.current;
          try {
            recognitionRef.current = createRecognition();
            recognitionRef.current.start();
          } catch (e) {}
        } else {
          setIsDictating(null);
        }
      };

      return rec;
    };

    try {
      recognitionRef.current = createRecognition();
      recognitionRef.current.start();
    } catch (e: any) {
      setError("Speech recognition failed to start.");
      isActuallyDictatingRef.current = false;
      setIsDictating(null);
    }
  };

  // Live Session Implementation
  const startLiveSession = async () => {
    if (liveActive) return;
    setError(null);
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      liveAudioContextRef.current = outCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          systemInstruction: 'You are a wise and patient Quran tutor. You provide word-by-word analysis, tafsir insights, and tajweed correction. Speak warmly and provide meanings in both Tamil and English when requested.'
        },
        callbacks: {
          onopen: () => {
            setLiveActive(true);
            setLoading(false);
            const source = inCtx.createMediaStreamSource(stream);
            const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const ctx = liveAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => liveSourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              liveSourcesRef.current.add(source);
            }
            if (message.serverContent?.interrupted) {
              liveSourcesRef.current.forEach(s => s.stop());
              liveSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error("Live Error:", e);
            setError("Live AI session disconnected.");
            stopLiveSession();
          },
          onclose: () => stopLiveSession()
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError("Failed to access microphone or connect to AI service.");
      setLoading(false);
    }
  };

  const stopLiveSession = () => {
    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch (e) {}
      liveSessionRef.current = null;
    }
    liveSourcesRef.current.forEach(s => s.stop());
    liveSourcesRef.current.clear();
    setLiveActive(false);
  };

  const playRecitationAsync = async (text: string, id: string) => {
    if (playingId === id) { stopAudio(); return; }
    await playRecitation(text, id);
  };

  const handleAction = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try { await fn(); }
    catch (err: any) { setError(err.message || "An error occurred during processing."); }
    finally { setLoading(false); }
  };

  const copyToClipboard = async (text: string, message: string = "Copied!") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(message);
      setTimeout(() => setCopiedMessage(null), 2000);
    } catch (err) { setError('Failed to copy text.'); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, target: 'quran' | 'hifz' | 'tafsir') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const result = await processFileUpload(file);
      if (target === 'quran') {
        setQuranPayload(result.data);
        setQuranFilePreview(result.preview);
        setQuranInput(`[File: ${file.name}]`);
      } else if (target === 'hifz') {
        setHifzPayload(result.data);
        setHifzFilePreview(result.preview);
        setHifzInput(`[File: ${file.name}]`);
      } else if (target === 'tafsir') {
        setTafsirPayload(result.data);
        setTafsirFilePreview(result.preview);
        setTafsirInput(`[File: ${file.name}]`);
      }
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const processFileUpload = async (file: File): Promise<any> => {
    const isImage = file.type.startsWith('image/');
    if (isImage) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          resolve({ 
            data: { data: base64, mimeType: file.type }, 
            preview: { type: 'image', content: e.target?.result as string }
          });
        };
        reader.readAsDataURL(file);
      });
    }
    // Handle others (Excel, Word, Text)
    if (file.type.includes('spreadsheet') || file.name.endsWith('.xlsx')) {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      let fullText = "";
      workbook.SheetNames.forEach(sheet => {
        fullText += XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]) + "\n";
      });
      return { data: fullText, preview: { type: 'text', content: fullText } };
    }
    const text = await file.text();
    return { data: text, preview: { type: 'text', content: text } };
  };

  const renderView = () => {
    switch (activeView) {
      case AppView.DASHBOARD:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-10 max-w-7xl mx-auto">
            <FeatureCard title="Quran Analysis Lab" desc="Word-by-word breakdown with Tamil meanings and audio." icon={<BookOpen className="text-emerald-600" />} onClick={() => setActiveView(AppView.QURAN)} />
            <FeatureCard title="Memorization Studio" desc="Hifz training with word masking and AI pronunciation audit." icon={<GraduationCap className="text-purple-600" />} onClick={() => setActiveView(AppView.HIFZ)} />
            <FeatureCard title="Tafsir Lab" desc="Get classical exegesis in Tamil and English." icon={<FileText className="text-blue-600" />} onClick={() => setActiveView(AppView.TAFSIR)} />
            <div className="md:col-span-2 lg:col-span-3 bg-gradient-to-r from-indigo-600 to-purple-600 p-12 rounded-[4rem] text-white flex flex-col md:flex-row items-center justify-between gap-10 shadow-3xl shadow-indigo-200">
               <div className="space-y-6 flex-1">
                  <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-sm font-black tracking-widest uppercase">
                    <Sparkles size={16} /> New Feature
                  </div>
                  <h3 className="text-5xl font-black tracking-tighter">Live AI Quran Tutor</h3>
                  <p className="text-xl text-indigo-100 font-medium leading-relaxed max-w-xl">
                    Experience real-time voice conversations. Ask questions about Tajweed, meanings, or history and get human-like responses in Tamil and English.
                  </p>
                  <button onClick={startLiveSession} className="bg-white text-indigo-600 px-10 py-5 rounded-[2rem] font-black text-lg hover:scale-105 transition-all shadow-xl flex items-center gap-4">
                    <Headphones size={24} /> START VOICE CONVERSATION
                  </button>
               </div>
               <div className="w-full md:w-80 h-80 bg-white/10 rounded-[3rem] border-4 border-white/20 flex items-center justify-center backdrop-blur-md relative overflow-hidden group">
                  <div className={`w-32 h-32 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-2xl relative z-10 ${liveActive ? 'animate-ping' : ''}`}>
                    <Mic size={48} />
                  </div>
                  {liveActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-64 h-64 border-4 border-white/30 rounded-full animate-[ping_3s_linear_infinite]" />
                      <div className="w-48 h-48 border-4 border-white/40 rounded-full animate-[ping_2s_linear_infinite]" />
                    </div>
                  )}
               </div>
            </div>
          </div>
        );

      case AppView.QURAN:
        return (
          <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black flex items-center gap-3"><BookOpen className="text-emerald-600" /> Analysis Lab</h2>
              <div className="flex gap-4">
                <select value={dictationLang} onChange={(e) => setDictationLang(e.target.value as any)} className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black text-slate-500">
                  <option value="ar-SA">ARABIC INPUT</option>
                  <option value="ta-IN">TAMIL INPUT</option>
                </select>
                <button onClick={resetQuran} className="text-xs font-black text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"><Trash2 size={16} /> RESET</button>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 space-y-6">
              <div className="relative group">
                <textarea className="w-full p-8 pr-28 border-2 border-slate-100 rounded-[2.5rem] h-44 focus:ring-4 focus:ring-emerald-100 outline-none text-xl font-medium transition-all" placeholder="Paste Quran verse or click the microphone to speak..." value={quranInput} onChange={(e) => setQuranInput(e.target.value)} />
                <div className="absolute bottom-6 right-6 flex gap-3">
                  <button onClick={() => toggleDictation('quran')} className={`p-5 rounded-[1.5rem] shadow-xl transition-all ${isDictating === 'quran' ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Start/Stop Switch">
                    {isDictating === 'quran' ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                  <button onClick={() => playRecitationAsync(quranInput, 'q-read')} className={`p-5 rounded-[1.5rem] shadow-xl transition-all ${playingId === 'q-read' ? 'bg-red-600 text-white animate-pulse' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                    {playingId === 'q-read' ? <Square size={24} fill="white" /> : <Volume2 size={24} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-6">
                <button disabled={loading || !quranInput} onClick={() => handleAction(async () => { setQuranResult(await analyzeQuranVerse(quranPayload || quranInput)); })} className="flex-[2] bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black hover:bg-emerald-700 shadow-xl flex items-center justify-center gap-4 transition-transform active:scale-95">
                  {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit size={28} />} ANALYZE VERSE
                </button>
                <label className="flex-1 cursor-pointer bg-slate-50 border-4 border-dashed border-slate-200 py-5 rounded-[1.5rem] font-black hover:bg-slate-100 flex flex-col items-center justify-center gap-2 shadow-inner">
                  <Upload size={24} className="text-slate-500" /><span>UPLOAD MUSHAF</span>
                  <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'quran')} />
                </label>
              </div>
            </div>

            {quranResult.length > 0 && (
              <div className="space-y-6 animate-in fade-in zoom-in-95">
                <div className="flex flex-wrap items-center gap-4 bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-2xl">
                   <span className="text-xs font-black uppercase tracking-widest text-slate-500 px-4">Toggles</span>
                  <button onClick={() => setHideTamilQuran(!hideTamilQuran)} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all ${hideTamilQuran ? 'bg-emerald-600' : 'bg-slate-800 text-slate-400'}`}>{hideTamilQuran ? 'SHOW TAMIL' : 'HIDE TAMIL'}</button>
                  <button onClick={() => setHideEnglishQuran(!hideEnglishQuran)} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all ${hideEnglishQuran ? 'bg-indigo-600' : 'bg-slate-800 text-slate-400'}`}>{hideEnglishQuran ? 'SHOW ENGLISH' : 'HIDE ENGLISH'}</button>
                </div>
                <div className="bg-white rounded-[3.5rem] shadow-3xl border border-slate-100 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b-2 border-slate-100">
                      <tr>
                        <th className="px-10 py-8 text-left text-xs font-black uppercase tracking-widest text-slate-400">Word</th>
                        <th className="px-10 py-8 text-left text-xs font-black uppercase tracking-widest text-slate-400">Tamil Meaning</th>
                        <th className="px-10 py-8 text-left text-xs font-black uppercase tracking-widest text-slate-400">English Meaning</th>
                        <th className="px-10 py-8 text-center text-xs font-black uppercase tracking-widest text-slate-400">Listen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quranResult.map((word, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-10 py-10 font-quran text-6xl text-right text-emerald-950" dir="rtl">{word.arabic}</td>
                          <td className={`px-10 py-10 font-bold text-xl cursor-pointer ${hideTamilQuran && !peekIndices.has(`${idx}-ta`) ? 'blur-lg select-none opacity-10' : 'text-emerald-900'}`} onClick={() => hideTamilQuran && setPeekIndices(p => { const n = new Set(p); n.has(`${idx}-ta`) ? n.delete(`${idx}-ta`) : n.add(`${idx}-ta`); return n; })}>{word.tamilMeaning}</td>
                          <td className={`px-10 py-10 text-slate-500 font-semibold cursor-pointer ${hideEnglishQuran && !peekIndices.has(`${idx}-en`) ? 'blur-lg select-none opacity-10' : ''}`} onClick={() => hideEnglishQuran && setPeekIndices(p => { const n = new Set(p); n.has(`${idx}-en`) ? n.delete(`${idx}-en`) : n.add(`${idx}-en`); return n; })}>{word.englishMeaning}</td>
                          <td className="px-10 py-10 text-center">
                            <button onClick={() => playRecitationAsync(word.arabic, `w-${idx}`)} className={`p-5 rounded-3xl transition-all ${playingId === `w-${idx}` ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                              {playingId === `w-${idx}` ? <Square size={24} fill="currentColor" /> : <Volume2 size={24} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );

      case AppView.HIFZ:
        return (
          <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-10">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black flex items-center gap-4"><GraduationCap className="text-purple-600" /> Memorization Studio</h2>
              <button onClick={resetLab} className="text-xs font-black text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"><Trash2 size={16} /> RESET</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-8 space-y-8">
                <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100 space-y-6">
                  <div className="relative">
                    <textarea className="w-full p-10 border-2 border-slate-100 rounded-[3rem] h-40 focus:ring-4 focus:ring-purple-100 outline-none text-right font-quran text-4xl bg-slate-50 leading-loose" placeholder="Paste verse to test recall..." value={hifzInput} dir="rtl" onChange={(e) => setHifzInput(e.target.value)} />
                    <div className="absolute bottom-6 left-6">
                       <button onClick={() => toggleDictation('hifz')} className={`p-5 rounded-[1.5rem] shadow-xl transition-all ${isDictating === 'hifz' ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-slate-400 border border-slate-200'}`}>
                        {isDictating === 'hifz' ? <MicOff size={24} /> : <Mic size={24} />}
                      </button>
                    </div>
                  </div>
                  <button disabled={loading || !hifzInput} onClick={() => handleAction(async () => { setHifzChallenge(await analyzeHifzChallenge(hifzInput)); })} className="w-full bg-purple-600 text-white py-6 rounded-[2rem] font-black hover:bg-purple-700 shadow-xl flex items-center justify-center gap-4 text-xl">
                    {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit size={28} />} START RECALL TRAINING
                  </button>
                </div>
                {hifzChallenge && (
                  <div className="bg-slate-900 text-white p-12 rounded-[4rem] shadow-3xl space-y-10 border-t-[16px] border-purple-600 animate-in slide-in-from-bottom-10">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-[0.4em] text-purple-400">Interactive Reciter Mode</span>
                      <button onClick={() => setHifzMaskedIndices(new Set())} className="text-[10px] font-black uppercase bg-white/10 px-4 py-2 rounded-full hover:bg-white/20 transition-colors">REVEAL ALL WORDS</button>
                    </div>
                    <div className="space-y-20 py-10" dir="rtl">
                       <div className="w-full flex flex-wrap gap-x-10 gap-y-16 justify-center items-center">
                          {hifzChallenge.originalVerse.split(/\s+/).map((word, wordIdx) => {
                            const isMasked = hifzMaskedIndices.has(`${wordIdx}`);
                            return (
                              <div key={wordIdx} className="flex flex-col items-center gap-6 group">
                                <button onClick={() => { const n = new Set(hifzMaskedIndices); n.has(`${wordIdx}`) ? n.delete(`${wordIdx}`) : n.add(`${wordIdx}`); setHifzMaskedIndices(n); }} className={`font-quran text-7xl px-8 py-6 rounded-[2.5rem] transition-all duration-500 ${isMasked ? 'bg-purple-900/30 text-transparent border-2 border-dashed border-purple-700 blur-2xl scale-90' : 'bg-white/5 text-white border-2 border-white/10 hover:bg-white/15 hover:scale-105'}`}>
                                  {word}
                                </button>
                                <button onClick={() => playRecitationAsync(word, `hw-${wordIdx}`)} className={`p-4 rounded-full transition-all ${playingId === `hw-${wordIdx}` ? 'bg-red-500 scale-110' : 'bg-white/5 opacity-0 group-hover:opacity-100 hover:bg-purple-600'}`}>
                                  <Volume2 size={20} />
                                </button>
                              </div>
                            );
                          })}
                       </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="lg:col-span-4 space-y-10">
                 <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border-2 border-purple-50">
                    <h3 className="font-black text-xs uppercase tracking-widest text-purple-600 mb-6 flex items-center gap-2"><Sparkles size={16}/> Coaching Insight</h3>
                    <div className="space-y-8">
                       <div className="bg-slate-50 p-6 rounded-3xl space-y-4">
                          <p className="font-bold text-slate-800">{hifzChallenge?.tipsTamil || "Waiting for verse..."}</p>
                          <p className="text-sm text-slate-500 italic">{hifzChallenge?.tipsEnglish}</p>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        );

      case AppView.TAFSIR:
        return (
          <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black flex items-center gap-3"><FileText className="text-blue-600" /> Tafsir Lab</h2>
              <button onClick={resetLab} className="text-xs font-black text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"><Trash2 size={16} /> RESET</button>
            </div>
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 space-y-6">
              <div className="relative group">
                <textarea className="w-full p-8 border-2 border-slate-100 rounded-[2.5rem] h-44 focus:ring-4 focus:ring-blue-100 outline-none text-xl font-medium transition-all" placeholder="Enter verse for comprehensive Tafsir..." value={tafsirInput} onChange={(e) => setTafsirInput(e.target.value)} />
                <div className="absolute bottom-6 right-6">
                   <button onClick={() => toggleDictation('tafsir')} className={`p-5 rounded-[1.5rem] shadow-xl transition-all ${isDictating === 'tafsir' ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {isDictating === 'tafsir' ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                </div>
              </div>
              <button disabled={loading || !tafsirInput} onClick={() => handleAction(async () => { setTafsirResult(await generateTafsir(tafsirPayload || tafsirInput)); })} className="w-full bg-blue-600 text-white py-5 rounded-[1.5rem] font-black hover:bg-blue-700 shadow-xl flex items-center justify-center gap-4 transition-transform active:scale-95">
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={28} />} GENERATE TAFSIR
              </button>
            </div>

            {tafsirResult && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-5">
                <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-lg text-slate-900 flex items-center gap-2"><Languages className="text-blue-600" /> Tamil Tafsir</h3>
                    <button onClick={() => copyToClipboard(tafsirResult.tamilTafsir)} className="p-3 hover:bg-slate-100 rounded-xl transition-colors"><Clipboard size={20}/></button>
                  </div>
                  <p className="text-xl font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">{tafsirResult.tamilTafsir}</p>
                </div>
                <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-lg text-slate-900 flex items-center gap-2"><Languages className="text-indigo-600" /> English Tafsir</h3>
                    <button onClick={() => copyToClipboard(tafsirResult.englishTafsir)} className="p-3 hover:bg-slate-100 rounded-xl transition-colors"><Clipboard size={20}/></button>
                  </div>
                  <p className="text-lg font-medium text-slate-600 leading-relaxed whitespace-pre-wrap italic">{tafsirResult.englishTafsir}</p>
                </div>
              </div>
            )}
          </div>
        );

      case AppView.TUTORIAL:
        return (
          <div className="p-10 max-w-5xl mx-auto space-y-16">
            <header className="text-center space-y-6">
              <div className="inline-block p-6 bg-indigo-100 rounded-full text-indigo-600 shadow-inner"><Sparkles size={48} /></div>
              <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Mastering Learn Pro</h2>
              <p className="text-slate-500 text-xl font-medium leading-relaxed">Advanced tools for Quranic excellence.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
               <TutorialStep title="Voice Switch" icon={<Mic size={32} />} color="amber">Use the dictation switch to toggle continuous listening. It stays active until you turn it off manually.</TutorialStep>
               <TutorialStep title="Word Analysis" icon={<BookOpen size={32} />} color="emerald">Deep word-by-word analysis with meanings in Tamil and English with audio support.</TutorialStep>
               <TutorialStep title="Live AI Tutor" icon={<Headphones size={32} />} color="indigo">Talk directly to an AI that understands Quranic sciences in real-time.</TutorialStep>
               <TutorialStep title="Recall Testing" icon={<GraduationCap size={32} />} color="purple">Mask individual words in verses to test and strengthen your memorization.</TutorialStep>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden font-sans">
      {sidebarOpen && <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-50 bg-white border-r-2 border-slate-100 transition-all duration-500 ${sidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 overflow-hidden shadow-2xl'}`}>
        <div className="h-full w-80 flex flex-col p-10">
          <div className="flex items-center gap-4 mb-14">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl"><Settings size={24} /></div>
            <h1 className="font-black text-2xl tracking-tighter">Learn Pro</h1>
          </div>
          <nav className="flex-1 space-y-4">
            <SidebarItem icon={<LayoutDashboard size={24} />} label="DASHBOARD" active={activeView === AppView.DASHBOARD} onClick={() => setActiveView(AppView.DASHBOARD)} />
            <div className="pt-10 pb-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Workspace</div>
            <SidebarItem icon={<BookOpen size={24} />} label="ANALYSIS LAB" active={activeView === AppView.QURAN} onClick={() => setActiveView(AppView.QURAN)} />
            <SidebarItem icon={<GraduationCap size={24} />} label="HIFZ STUDIO" active={activeView === AppView.HIFZ} onClick={() => setActiveView(AppView.HIFZ)} />
            <SidebarItem icon={<FileText size={24} />} label="TAFSIR LAB" active={activeView === AppView.TAFSIR} onClick={() => setActiveView(AppView.TAFSIR)} />
            <SidebarItem icon={<HelpCircle size={24} />} label="HELP & GUIDE" active={activeView === AppView.TUTORIAL} onClick={() => setActiveView(AppView.TUTORIAL)} />
          </nav>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-24 bg-white/80 backdrop-blur-2xl border-b-2 border-slate-100 sticky top-0 z-30 flex items-center justify-between px-8 md:px-12">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-4 hover:bg-slate-100 rounded-2xl text-slate-600 transition-all"><Menu size={28} /></button>
          <div className="flex items-center gap-4">
            {liveActive && (
              <div className="flex items-center gap-3 bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100 animate-pulse">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-widest">Live AI Session</span>
                <button onClick={stopLiveSession} className="ml-2 hover:scale-110"><X size={16}/></button>
              </div>
            )}
            <div className="h-12 w-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black">LP</div>
          </div>
        </header>
        {error && <div className="m-10 p-8 bg-red-50 border-2 border-red-100 rounded-3xl text-red-600 font-bold flex items-center gap-4 animate-in fade-in"><Info size={24}/> {error}</div>}
        <main className="flex-1 overflow-y-auto pb-24">{renderView()}</main>
        {copiedMessage && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl font-black text-sm animate-in fade-in-up slide-in-from-bottom-5 z-50">{copiedMessage}</div>}
      </div>
    </div>
  );
};

const FeatureCard: React.FC<{ title: string; desc: string; icon: React.ReactNode; onClick: () => void }> = ({ title, desc, icon, onClick }) => (
  <button onClick={onClick} className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 shadow-xl hover:shadow-3xl hover:-translate-y-4 transition-all duration-500 text-left flex flex-col gap-6 group">
    <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center group-hover:bg-indigo-50 transition-all shadow-inner border border-slate-100">{icon}</div>
    <h3 className="text-3xl font-black tracking-tighter">{title}</h3>
    <p className="text-slate-500 text-lg leading-relaxed">{desc}</p>
    <div className="mt-4 flex items-center gap-4 text-indigo-600 font-black text-xs uppercase tracking-widest">Launch <ArrowRightCircle size={22} /></div>
  </button>
);

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-5 px-8 py-6 rounded-3xl transition-all ${active ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-400 hover:bg-slate-50'}`}>
    {icon} <span className="font-black text-xs tracking-widest">{label}</span>
  </button>
);

const TutorialStep: React.FC<{ title: string; icon: React.ReactNode; color: string; children: React.ReactNode }> = ({ title, icon, color, children }) => (
  <div className="bg-white p-10 rounded-[3.5rem] border-2 border-slate-100 shadow-xl">
    <div className={`w-16 h-16 bg-${color}-100 text-${color}-600 rounded-2xl flex items-center justify-center mb-8`}>{icon}</div>
    <h4 className="text-2xl font-black mb-4">{title}</h4>
    <p className="text-slate-500 font-medium leading-relaxed">{children}</p>
  </div>
);

export default App;
