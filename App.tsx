

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
  RefreshCw,
  Zap,
  Info,
  Printer,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  ArrowRightCircle,
  ArrowRight,
  Eye as EyeIcon,
  Copy,
  Check,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  MicOff,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Edit,
  Save,
  Plus,
  Share2, // New import for general sharing icon
  Clipboard // New import for copy to clipboard icon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { AppView, QuranWord, HifzChallenge, RecitationFeedback, TafsirResult } from './types';
import { 
  analyzeQuranVerse, 
  generateSpeech,
  analyzeHifzChallenge,
  verifyRecitation,
  extractTextForReading,
  generateTafsir // Import new Tafsir service
} from './services/geminiService';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>(AppView.DASHBOARD);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null); // For copy to clipboard feedback

  // Configuration
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [customTajweedRules, setCustomTajweedRules] = useState<string>('');
  const [showCustomRulesInput, setShowCustomRulesInput] = useState(false);
  const [tempCustomRules, setTempCustomRules] = useState<string>(''); // For text area

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
  const [hideTamilHifz, setHideTamilHifz] = useState(false);
  const [hideEnglishHifz, setHideEnglishHifz] = useState(false);

  // Tafsir Lab state (NEW)
  const [tafsirInput, setTafsirInput] = useState('');
  const [tafsirResult, setTafsirResult] = useState<TafsirResult | null>(null);
  const [tafsirPayload, setTafsirPayload] = useState<any>(null);
  const [tafsirFilePreview, setTafsirFilePreview] = useState<{type: 'image' | 'text', content: string} | null>(null);
  const [hideTamilTafsir, setHideTamilTafsir] = useState(false);
  const [hideEnglishTafsir, setHideEnglishTafsir] = useState(false);
  const [playingTafsirId, setPlayingTafsirId] = useState<string | null>(null); // For Tafsir audio playback
  
  // Voice states
  const [isRecording, setIsRecording] = useState(false);
  const [isDictating, setIsDictating] = useState<string | null>(null); // 'quran' | 'hifz' | 'tafsir' | null (updated)
  const [dictationStartText, setDictationStartText] = useState('');
  const [recordedAudio, setRecordedAudio] = useState<{data: string, mimeType: string} | null>(null);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  // Audio Engine
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const savedRules = localStorage.getItem('customTajweedRules');
    if (savedRules) {
        setCustomTajweedRules(savedRules);
        setTempCustomRules(savedRules); // Initialize temp with saved rules
    }
  }, []);

  useEffect(() => {
      if (customTajweedRules) {
          localStorage.setItem('customTajweedRules', customTajweedRules);
      } else {
          localStorage.removeItem('customTajweedRules');
      }
  }, [customTajweedRules]);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    setPlayingId(null);
    setPlayingTafsirId(null); // Also stop Tafsir audio
  };

  // Generalized reset function for all labs
  const resetLab = () => {
    stopAudio();
    // Reset Quran Lab states
    setQuranInput('');
    setQuranResult([]);
    setQuranPayload(null);
    setQuranFilePreview(null);
    setPeekIndices(new Set());
    // Reset Hifz Studio states
    setHifzInput('');
    setHifzChallenge(null);
    setHifzPayload(null);
    setHifzFilePreview(null);
    setHifzMaskedIndices(new Set());
    setRecitationFeedback(null);
    setRecordedAudio(null);
    setRecordedBlobUrl(null);
    setIsRecording(false);
    // Reset Tafsir Lab states (NEW)
    setTafsirInput('');
    setTafsirResult(null);
    setTafsirPayload(null);
    setTafsirFilePreview(null);
    setHideTamilTafsir(false);
    setHideEnglishTafsir(false);
    setPlayingTafsirId(null);
    // Reset dictation
    setIsDictating(null);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const resetQuran = () => {
    resetLab(); // Call general reset
    // Specific Quran reset if any
  };

  const resetHifz = () => {
    resetLab(); // Call general reset
    // Specific Hifz reset if any
  };

  const resetTafsir = () => { // NEW reset for Tafsir
    resetLab(); // Call general reset
    // Specific Tafsir reset if any
  };

  const playRecitation = async (text: string, id: string, setPlayingState: React.Dispatch<React.SetStateAction<string | null>> = setPlayingId) => {
    stopAudio(); // Stop any currently playing audio
    setPlayingState(id);
    const ctx = getAudioContext();
    try {
      const base64Audio = await generateSpeech(text);
      if (!base64Audio || id === 'STOPPED') { // Use the passed ID for comparison
        setPlayingState(null);
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
      source.onended = () => { if (setPlayingState === setPlayingId && playingId === id) setPlayingState(null); else if (setPlayingState === setPlayingTafsirId && playingTafsirId === id) setPlayingState(null); }; // Check which state to clear
      audioSourceRef.current = source;
      source.start();
    } catch (err) {
      console.error("Audio error:", err);
      setPlayingState(null);
    }
  };

  const handleReadFull = async (text: string, payload: any, id: string) => {
    if (playingId === id) { stopAudio(); return; }
    setLoading(true);
    try {
      let textToRead = text;
      if (payload) textToRead = await extractTextForReading(payload);
      if (!textToRead || textToRead.trim().length === 0) throw new Error("No text found.");
      await playRecitation(textToRead, id);
    } catch (err: any) {
      setError(err.message || "Failed to read.");
    } finally {
      setLoading(false);
    }
  };

  const processFileUpload = async (file: File): Promise<{ data: any; type: 'inline' | 'text'; preview: {type: 'image' | 'text', content: string} }> => {
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    const isExcel = file.type.includes('spreadsheet') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type === 'text/csv';
    const isWord = file.type.includes('word') || file.name.endsWith('.docx');

    if (isImage) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          resolve({ 
            data: { data: base64, mimeType: file.type }, 
            type: 'inline',
            preview: { type: 'image', content: e.target?.result as string }
          });
        };
        reader.readAsDataURL(file);
      });
    }

    if (isPdf) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          resolve({ 
            data: { data: base64, mimeType: file.type }, 
            type: 'inline',
            preview: { type: 'text', content: `[Document: ${file.name}] Processing content for display...` }
          });
        };
        reader.readAsDataURL(file);
      });
    }

    if (isExcel) {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      let fullText = "";
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        fullText += `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}\n\n`;
      });
      return { data: fullText, type: 'text', preview: { type: 'text', content: fullText } };
    }

    if (isWord) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { data: result.value, type: 'text', preview: { type: 'text', content: result.value } };
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        resolve({ data: text, type: 'text', preview: { type: 'text', content: text } });
      };
      reader.readAsText(file);
    });
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
        setQuranInput(`Document: ${file.name}`);
        if (file.type === 'application/pdf') {
          const txt = await extractTextForReading(result.data);
          setQuranFilePreview({ type: 'text', content: txt });
        }
      } else if (target === 'hifz') {
        setHifzPayload(result.data);
        setHifzFilePreview(result.preview);
        setHifzInput(`Document: ${file.name}`);
        if (file.type === 'application/pdf') {
          const txt = await extractTextForReading(result.data);
          setHifzFilePreview({ type: 'text', content: txt });
        }
      } else if (target === 'tafsir') { // NEW Tafsir file handling
        setTafsirPayload(result.data);
        setTafsirFilePreview(result.preview);
        setTafsirInput(`Document: ${file.name}`);
        if (file.type === 'application/pdf') {
          const txt = await extractTextForReading(result.data);
          setTafsirFilePreview({ type: 'text', content: txt });
        }
      }
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleDictation = (target: 'quran' | 'hifz' | 'tafsir') => { // Updated target
    if (isDictating) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsDictating(null);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ar-SA'; 

    let startText = '';
    if (target === 'quran') startText = quranInput;
    else if (target === 'hifz') startText = hifzInput;
    else if (target === 'tafsir') startText = tafsirInput; // NEW target
    
    setDictationStartText(startText);

    recognition.onresult = (event: any) => {
      let sessionTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        sessionTranscript += event.results[i][0].transcript;
      }
      const updatedValue = (startText ? startText + ' ' : '') + sessionTranscript;
      if (target === 'quran') {
        setQuranInput(updatedValue);
      } else if (target === 'hifz') {
        setHifzInput(updatedValue);
      } else if (target === 'tafsir') { // NEW target
        setTafsirInput(updatedValue);
      }
    };

    recognition.onerror = (event: any) => {
      setIsDictating(null);
      if (event.error === 'network') {
        setError("Speech recognition network error. Please check your internet connection.");
      } else if (event.error === 'not-allowed') {
        setError("Microphone permission denied.");
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsDictating(null);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsDictating(target);
    } catch (e: any) {
      setError(`Failed to start recognition: ${e.message}`);
      setIsDictating(null);
    }
  };

  const startVoiceCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlobUrl(URL.createObjectURL(blob));
        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedAudio({ data: (reader.result as string).split(',')[1], mimeType: 'audio/webm' });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) { setError("Permission denied for microphone."); }
  };

  const stopVoiceCapture = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAction = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try { await fn(); }
    catch (err: any) { setError(err.message || "Something went wrong."); }
    finally { setLoading(false); }
  };

  const DocumentPreview = ({ preview, onClear }: { preview: {type: 'image' | 'text', content: string} | null, onClear: () => void }) => {
    if (!preview) return null;
    return (
      <div className="bg-slate-50 border-2 border-slate-200 rounded-[2rem] overflow-hidden mt-6 shadow-sm border-dashed">
        <div className="flex items-center justify-between px-8 py-4 bg-slate-100/50 border-b border-slate-200">
          <div className="flex items-center gap-2 text-slate-700 font-black text-xs uppercase tracking-widest">
            <EyeIcon size={16} className="text-indigo-500" /> FULL DOCUMENT VIEW
          </div>
          <button onClick={onClear} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-8 max-h-[450px] overflow-y-auto custom-scrollbar">
          {preview.type === 'image' ? (
            <img src={preview.content} alt="Source" className="max-w-full rounded-2xl shadow-xl mx-auto border-4 border-white" />
          ) : (
            <div className="whitespace-pre-wrap font-medium text-slate-800 leading-relaxed text-sm bg-white p-8 rounded-2xl shadow-inner border border-slate-200">{preview.content}</div>
          )}
        </div>
      </div>
    );
  };

  // Sharing Functions
  const copyToClipboard = async (text: string, message: string = "Copied!") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(message);
      setTimeout(() => setCopiedMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setError('Failed to copy text.');
    }
  };

  const handleNativeShare = async (title: string, text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
          url: window.location.href, // Share the current page URL
        });
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error);
          setError('Failed to share content.');
        }
      }
    } else {
      copyToClipboard(text, "Sharing not supported, content copied to clipboard!");
    }
  };


  const renderView = () => {
    switch (activeView) {
      case AppView.DASHBOARD:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-10 max-w-7xl mx-auto">
            <FeatureCard title="Quran Analysis Lab" desc="Word-by-word breakdown with Tamil meanings and Tajweed audio." icon={<BookOpen className="text-emerald-600" />} onClick={() => setActiveView(AppView.QURAN)} />
            <FeatureCard title="Memorization Studio" desc="Challenge your Hifz with word masking and AI-driven recitation audit." icon={<GraduationCap className="text-purple-600" />} onClick={() => setActiveView(AppView.HIFZ)} />
            <FeatureCard title="Tafsir Lab" desc="Get comprehensive Tamil and English explanations for any Quranic verse." icon={<FileText className="text-blue-600" />} onClick={() => setActiveView(AppView.TAFSIR)} /> {/* NEW */}
            <FeatureCard title="Help & Guides" desc="Learn how to master the AI tools effectively." icon={<HelpCircle className="text-blue-600" />} onClick={() => setActiveView(AppView.TUTORIAL)} />
          </div>
        );

      case AppView.QURAN:
        return (
          <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black flex items-center gap-3"><BookOpen className="text-emerald-600" /> Analysis Lab</h2>
              <button onClick={resetQuran} className="text-xs font-black text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                <Trash2 size={16} /> RESET
              </button>
            </div>
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 space-y-6">
              <div className="relative">
                <textarea className="w-full p-8 pr-28 border-2 border-slate-100 rounded-[2rem] h-40 focus:ring-4 focus:ring-emerald-100 outline-none text-xl font-medium" placeholder="Type verse or upload a document..." value={quranInput} onChange={(e) => { setQuranInput(e.target.value); setQuranPayload(null); setQuranFilePreview(null); }} />
                <div className="absolute bottom-6 right-6 flex gap-3">
                  <button onClick={() => toggleDictation('quran')} className={`p-5 rounded-[1.5rem] shadow-xl transition-all ${isDictating === 'quran' ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Voice to Text">
                    {isDictating === 'quran' ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                  <button onClick={() => handleReadFull(quranInput, quranPayload, 'q-read')} className={`p-5 rounded-[1.5rem] shadow-xl transition-all ${playingId === 'q-read' ? 'bg-red-600 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`} title="Listen to Verse">
                    {playingId === 'q-read' ? <Square size={24} fill="white" /> : <Volume2 size={24} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-6">
                <button disabled={loading || (!quranInput && !quranPayload)} onClick={() => handleAction(async () => { setQuranResult(await analyzeQuranVerse(quranPayload || quranInput)); })} className="flex-[2] bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black hover:bg-emerald-700 shadow-xl flex items-center justify-center gap-4">
                  {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit size={28} />} ANALYZE VERSES
                </button>
                <label className="flex-1 cursor-pointer bg-slate-50 border-4 border-dashed border-slate-200 py-5 rounded-[1.5rem] font-black hover:bg-slate-100 flex flex-col items-center justify-center gap-2 group shadow-inner">
                  <div className="flex items-center gap-2"><Upload size={24} className="text-slate-500" /><span>UPLOAD</span></div>
                  <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'quran')} />
                </label>
              </div>
              <DocumentPreview preview={quranFilePreview} onClear={() => { setQuranFilePreview(null); setQuranPayload(null); setQuranInput(''); }} />
            </div>

            {quranResult.length > 0 && (
              <div className="space-y-6 animate-in fade-in">
                <div className="flex flex-wrap items-center gap-4 bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-2xl">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-500">Toggles:</span>
                  <button onClick={() => setHideTamilQuran(!hideTamilQuran)} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all ${hideTamilQuran ? 'bg-emerald-600' : 'bg-slate-800 text-slate-400'}`}>{hideTamilQuran ? <EyeOff size={16} /> : <Eye size={16} />} TAMIL</button>
                  <button onClick={() => setHideEnglishQuran(!hideEnglishQuran)} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all ${hideEnglishQuran ? 'bg-indigo-600' : 'bg-slate-800 text-slate-400'}`}>{hideEnglishQuran ? <EyeOff size={16} /> : <Eye size={16} />} ENGLISH</button>
                </div>
                <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b-2 border-slate-100">
                      <tr>
                        <th className="px-8 py-6 text-left text-xs font-black uppercase tracking-widest">Arabic Word</th>
                        <th className="px-8 py-6 text-left text-xs font-black uppercase tracking-widest">Tamil</th>
                        <th className="px-8 py-6 text-left text-xs font-black uppercase tracking-widest">English</th>
                        <th className="px-8 py-6 text-center text-xs font-black uppercase tracking-widest">Listen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quranResult.map((word, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-8 font-quran text-5xl text-right" dir="rtl">{word.arabic}</td>
                          <td className={`px-8 py-8 font-bold text-lg cursor-pointer ${hideTamilQuran && !peekIndices.has(`${idx}-ta`) ? 'blur-lg select-none opacity-20' : 'text-emerald-900'}`} onClick={() => hideTamilQuran && setPeekIndices(p => { const n = new Set(p); n.has(`${idx}-ta`) ? n.delete(`${idx}-ta`) : n.add(`${idx}-ta`); return n; })}>{word.tamilMeaning}</td>
                          <td className={`px-8 py-8 text-slate-600 font-semibold cursor-pointer ${hideEnglishQuran && !peekIndices.has(`${idx}-en`) ? 'blur-lg select-none opacity-20' : ''}`} onClick={() => hideEnglishQuran && setPeekIndices(p => { const n = new Set(p); n.has(`${idx}-en`) ? n.delete(`${idx}-en`) : n.add(`${idx}-en`); return n; })}>{word.englishMeaning}</td>
                          <td className="px-8 py-8 text-center">
                            <button onClick={() => playingId === `w-${idx}` ? stopAudio() : playRecitation(word.arabic, `w-${idx}`)} className={`p-4 rounded-2xl ${playingId === `w-${idx}` ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {playingId === `w-${idx}` ? <Square size={20} fill="currentColor" /> : <Volume2 size={20} />}
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
              <h2 className="text-3xl font-black flex items-center gap-4">
                <GraduationCap className="text-purple-600" /> Memorization Studio
              </h2>
              <button onClick={resetHifz} className="text-xs font-black text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                <Trash2 size={16} /> RESET
              </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Left Column: Input and Interactive Reciter */}
              <div className="lg:col-span-8 space-y-8">
                <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100 space-y-6">
                  <div className="relative">
                    <textarea 
                      className="w-full p-8 pr-28 border-2 border-slate-100 rounded-[2rem] h-32 focus:ring-4 focus:ring-purple-100 outline-none text-right font-quran text-4xl bg-slate-50 leading-loose" 
                      placeholder="Paste verse..." 
                      value={hifzInput} 
                      dir="rtl" 
                      onChange={(e) => setHifzInput(e.target.value)} 
                    />
                    <div className="absolute bottom-6 right-6 flex gap-3">
                      <button onClick={() => toggleDictation('hifz')} className={`p-5 rounded-[1.5rem] shadow-xl transition-all ${isDictating === 'hifz' ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`} title="Voice to Text">
                        {isDictating === 'hifz' ? <MicOff size={24} /> : <Mic size={24} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-6">
                    <button disabled={loading || !hifzInput} onClick={() => handleAction(async () => { setHifzChallenge(await analyzeHifzChallenge(hifzPayload || hifzInput, customTajweedRules)); })} className="flex-[2] bg-purple-600 text-white py-5 rounded-[1.5rem] font-black hover:bg-purple-700 shadow-xl flex items-center justify-center gap-4 transition-all active:scale-95">
                      {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit size={28} />} START TRAINING
                    </button>
                    <label className="flex-1 cursor-pointer bg-slate-50 border-4 border-dashed border-slate-200 py-5 rounded-[1.5rem] font-black hover:bg-slate-100 flex items-center justify-center gap-2 shadow-inner transition-colors">
                      <Upload size={22} /><span>FILE</span>
                      <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'hifz')} />
                    </label>
                  </div>
                  <DocumentPreview preview={hifzFilePreview} onClear={() => { setHifzFilePreview(null); setHifzPayload(null); setHifzInput(''); }} />
                </div>

                {hifzChallenge && (
                  <div className="bg-slate-900 text-white p-12 rounded-[4rem] shadow-2xl space-y-10 border-t-[20px] border-purple-600 animate-in zoom-in-95 overflow-hidden">
                    <div className="flex items-center justify-between pb-6 border-b border-white/10">
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
                        <span className="text-[11px] font-black uppercase tracking-[0.4em] text-purple-300">Interactive Reciter • Line by Line Mode</span>
                      </div>
                      <button onClick={() => setHifzMaskedIndices(new Set())} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/5"><RotateCcw size={14} /> REVEAL ALL</button>
                    </div>
                    
                    <div className="max-h-[600px] overflow-y-auto pr-2 scroll-smooth custom-scrollbar-dark px-2">
                      <div className="space-y-20 py-8" dir="rtl">
                        {hifzChallenge.originalVerse.split('\n').filter(line => line.trim()).map((line, lineIdx) => (
                          <div key={lineIdx} className="w-full flex flex-wrap gap-x-14 gap-y-20 justify-center items-center py-10 border-b border-white/5 last:border-0 relative group">
                            <div className="absolute -right-8 top-0 text-[10px] font-black text-white/10 rotate-90 uppercase tracking-[0.5em]">Line {lineIdx + 1}</div>
                            {line.split(/\s+/).map((word, wordIdx) => {
                              const key = `${lineIdx}-${wordIdx}`;
                              const isMasked = hifzMaskedIndices.has(key);
                              return (
                                <div key={wordIdx} className="flex flex-col items-center gap-8 group/word relative">
                                  <button 
                                    onClick={() => { 
                                      const n = new Set(hifzMaskedIndices); 
                                      n.has(key) ? n.delete(key) : n.add(key); 
                                      setHifzMaskedIndices(n); 
                                    }} 
                                    className={`font-quran text-7xl leading-[1.3] px-12 py-10 rounded-[3rem] transition-all duration-500 ${isMasked ? 'bg-purple-900/30 text-transparent border-4 border-dashed border-purple-700/50 blur-3xl scale-90 shadow-inner' : 'bg-white/5 text-white border-4 border-white/10 hover:bg-white/20 hover:scale-110 shadow-2xl hover:border-purple-500/50'}`}
                                  >
                                    {word}
                                  </button>
                                  <button 
                                    onClick={() => playingId === `hw-${key}` ? stopAudio() : playRecitation(word, `hw-${key}`)} 
                                    className={`p-4 rounded-full transition-all duration-300 transform ${playingId === `hw-${key}` ? 'bg-red-500 scale-125 shadow-red-500/40' : 'bg-white/10 hover:bg-purple-600 opacity-0 group-hover/word:opacity-100 hover:scale-110'}`}
                                  >
                                    {playingId === `hw-${key}` ? <Square size={20} fill="white" /> : <Volume2 size={20} />}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Tips and Audit */}
              <div className="lg:col-span-4 space-y-10">
                <InfoCard title="Memorization Tips" icon={<Zap className="text-purple-500" />} color="purple">
                  <div className="space-y-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Strategy & Focus</div>
                    <div className="bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 overflow-hidden shadow-inner group">
                      <div className="max-h-[300px] overflow-y-auto p-8 space-y-8 custom-scrollbar">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-purple-700 bg-purple-100 px-3 py-1 rounded-full uppercase">Tamil Guidance</span>
                            <div className="h-px flex-1 bg-purple-100" />
                          </div>
                          <p className="text-lg font-bold text-slate-800 leading-relaxed antialiased">{hifzChallenge?.tipsTamil || "Waiting for verse..."}</p>
                        </div>
                        <div className="space-y-3 border-t border-slate-200/50 pt-8">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-500 bg-slate-200 px-3 py-1 rounded-full uppercase">English Translation</span>
                            <div className="h-px flex-1 bg-slate-200" />
                          </div>
                          <p className="text-base font-medium text-slate-600 leading-relaxed italic antialiased">{hifzChallenge?.tipsEnglish || "Waiting for verse..."}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </InfoCard>

                <InfoCard title="Tajweed Rules" icon={<Settings className="text-amber-600" />} color="amber">
                  <div className="space-y-6">
                    <div className="bg-amber-50 rounded-[3rem] border-4 border-amber-100 shadow-xl overflow-hidden">
                      <div className="px-8 py-5 border-b-2 border-amber-100 bg-amber-100/50 flex items-center justify-between">
                         <span className="text-[11px] font-black text-amber-900 uppercase tracking-widest">Articulation & Flow</span>
                         <button onClick={() => setHideTamilHifz(!hideTamilHifz)} className={`p-2 rounded-xl transition-colors ${hideTamilHifz ? 'text-amber-300 bg-white' : 'text-amber-600 hover:bg-white'}`}><Eye size={16}/></button>
                      </div>
                      <div className="max-h-[350px] overflow-y-auto p-8 space-y-8 custom-scrollbar">
                        {!hideTamilHifz && (
                          <div className="space-y-6">
                            <div className="p-6 bg-white rounded-[2rem] shadow-sm border border-amber-200/50">
                              <h5 className="text-[10px] font-black text-amber-600 mb-4 uppercase tracking-tighter">Makharij & Tajweed (Tamil)</h5>
                              <p className="text-lg font-bold text-amber-950 leading-relaxed">{hifzChallenge?.tajweedTamil || "Details will appear here..."}</p>
                            </div>
                            <div className="p-6 bg-indigo-50/50 rounded-[2rem] shadow-sm border border-indigo-100">
                              <h5 className="text-[10px] font-black text-indigo-600 mb-4 uppercase tracking-tighter">Tartil Advice (Tamil)</h5>
                              <p className="text-base font-bold text-indigo-950 leading-relaxed">{hifzChallenge?.tartilTamil || "Awaiting input..."}</p>
                            </div>
                          </div>
                        )}
                        <div className="space-y-4 border-t-2 border-amber-100/50 pt-8">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">English References</h5>
                          <p className="text-sm font-medium text-slate-700 leading-relaxed italic bg-white/50 p-6 rounded-2xl">{hifzChallenge?.tajweedEnglish || "Pending..."}</p>
                          <p className="text-sm font-medium text-slate-600 leading-relaxed italic bg-indigo-50/30 p-6 rounded-2xl">{hifzChallenge?.tartilEnglish || "Pending..."}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </InfoCard>

                <InfoCard title="Custom Tajweed Rules" icon={<Sparkles className="text-emerald-600" />} color="emerald">
                  <div className="space-y-6">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Personalized Guidance</span>
                        {!showCustomRulesInput && customTajweedRules && (
                          <div className="flex gap-2">
                            <button onClick={() => { setShowCustomRulesInput(true); setTempCustomRules(customTajweedRules); }} className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors" title="Edit Custom Rules">
                                <Edit size={16} />
                            </button>
                            <button onClick={() => setCustomTajweedRules('')} className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Clear Custom Rules">
                                <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                        {!showCustomRulesInput && !customTajweedRules && (
                          <button onClick={() => setShowCustomRulesInput(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black hover:bg-emerald-200 transition-colors">
                              {/* Fix: Use the imported Plus icon */}
                              <Plus size={16} /> ADD RULES
                          </button>
                        )}
                    </div>

                    {showCustomRulesInput ? (
                      <div className="bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 shadow-inner p-6 space-y-4">
                        <textarea
                          className="w-full p-6 border-2 border-slate-200 rounded-2xl h-40 focus:ring-4 focus:ring-emerald-100 outline-none text-sm font-medium leading-relaxed"
                          placeholder="Example: Emphasize 'qalqalah' for specific letters (ق ط ب ج د). Ensure 'idgham' with 'ghunnah' for nun sakin. Double check madd al-lazim."
                          value={tempCustomRules}
                          onChange={(e) => setTempCustomRules(e.target.value)}
                        />
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => { setCustomTajweedRules(tempCustomRules); setShowCustomRulesInput(false); }} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 transition-colors">
                            <Save size={18} /> SAVE
                          </button>
                          <button onClick={() => { setShowCustomRulesInput(false); setTempCustomRules(customTajweedRules); }} className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-2xl font-black hover:bg-slate-300 transition-colors">
                            <X size={18} /> CANCEL
                          </button>
                        </div>
                      </div>
                    ) : (
                      customTajweedRules ? (
                        <div className="bg-emerald-50 rounded-[2.5rem] border-2 border-emerald-100 shadow-inner p-8">
                          <p className="text-emerald-900 text-base font-medium leading-relaxed whitespace-pre-wrap">{customTajweedRules}</p>
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 shadow-inner p-8 text-center text-slate-500 font-medium text-sm">
                          No custom rules defined yet. Click "ADD RULES" to personalize your Tajweed feedback.
                        </div>
                      )
                    )}
                  </div>
                </InfoCard>

                <div className="bg-slate-950 text-white p-10 rounded-[4rem] shadow-3xl space-y-10 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-purple-600/10 blur-[80px] -z-10 rounded-full" />
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-[11px] uppercase tracking-[0.3em] text-red-500">Recitation Mu'allim Audit</h3>
                    <div className="px-3 py-1 bg-red-500/10 text-red-500 text-[9px] font-black rounded-full border border-red-500/20">AI POWERED</div>
                  </div>

                  <div className="flex flex-col items-center gap-8 py-14 border-4 border-dashed border-slate-800 rounded-[3.5rem] bg-slate-900/50 hover:bg-slate-900 transition-all group/record">
                    <button 
                      onClick={isRecording ? stopVoiceCapture : startVoiceCapture} 
                      className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 shadow-4xl ${isRecording ? 'bg-red-500 animate-pulse ring-[20px] ring-red-500/10' : 'bg-red-600 hover:scale-110 hover:shadow-red-600/30'}`}
                    >
                      {isRecording ? <Square size={40} fill="white" /> : <Mic size={50} className="text-white" />}
                    </button>
                    <div className="text-center space-y-3">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">{isRecording ? 'Listening for Tajweed...' : 'Record Your Voice'}</span>
                      {recordedBlobUrl && !isRecording && (
                        <div className="flex items-center justify-center gap-2 bg-emerald-500/20 px-4 py-2 rounded-full border border-emerald-500/30 animate-in fade-in scale-90">
                          <Check size={14} className="text-emerald-500" />
                          <span className="text-[10px] font-black text-emerald-400 uppercase">Audio Ready for Audit</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {recordedBlobUrl && !isRecording && (
                    <button 
                      onClick={() => handleAction(async () => { if (recordedAudio) setRecitationFeedback(await verifyRecitation(hifzInput, recordedAudio, customTajweedRules)); })} 
                      className="w-full py-7 bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-[2.5rem] font-black uppercase text-[12px] tracking-[0.3em] shadow-2xl hover:shadow-indigo-500/40 transition-all active:scale-95 group overflow-hidden relative"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-3">
                        {loading ? <Loader2 className="animate-spin" /> : <><BrainCircuit size={20} /> ANALYZE PERFORMANCE</>}
                      </span>
                      <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                    </button>
                  )}

                  {recitationFeedback && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-700">
                      <div className="relative p-1 rounded-[3rem] bg-gradient-to-br from-emerald-400/50 via-teal-500/50 to-indigo-600/50 shadow-2xl">
                        <div className="flex flex-col items-center justify-center gap-2 p-10 bg-slate-950 rounded-[2.8rem] shadow-inner">
                          <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.4em]">Overall Accuracy</span>
                          <div className="flex items-end gap-2">
                            <span className={`text-7xl font-black tabular-nums tracking-tighter ${recitationFeedback.accuracyScore >= 90 ? 'text-emerald-400' : recitationFeedback.accuracyScore >= 75 ? 'text-amber-400' : 'text-red-400'}`}>{recitationFeedback.accuracyScore}</span>
                            <span className="text-2xl font-black text-slate-600 mb-3">%</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white/5 rounded-[3.5rem] border-2 border-white/10 overflow-hidden shadow-2xl">
                        <div className="px-10 py-6 border-b-2 border-white/5 bg-white/5 flex items-center gap-4">
                           <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                           <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Mu'allim Corrections</span>
                        </div>
                        <div className="p-10 max-h-[400px] overflow-y-auto space-y-10 custom-scrollbar-dark">
                          <div className="space-y-4">
                             <div className="flex items-center gap-3">
                               <span className="text-[9px] font-black text-emerald-400 border border-emerald-400/30 px-3 py-1 rounded-full uppercase">Tamil Feed</span>
                               <div className="h-px flex-1 bg-emerald-400/10" />
                             </div>
                             <p className="text-xl font-bold text-emerald-50 leading-[1.6] antialiased">{recitationFeedback.feedbackTamil}</p>
                          </div>
                          <div className="space-y-4 pt-10 border-t border-white/5">
                             <div className="flex items-center gap-3">
                               <span className="text-[9px] font-black text-slate-500 border border-white/10 px-3 py-1 rounded-full uppercase">English Breakdown</span>
                               <div className="h-px flex-1 bg-white/5" />
                             </div>
                             <p className="text-base font-medium text-slate-400 leading-relaxed italic antialiased">{recitationFeedback.feedbackEnglish}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case AppView.TAFSIR: // NEW Tafsir Lab View
        return (
          <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black flex items-center gap-3"><FileText className="text-blue-600" /> Tafsir Lab</h2>
              <button onClick={resetTafsir} className="text-xs font-black text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                <Trash2 size={16} /> RESET
              </button>
            </div>
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 space-y-6">
              <div className="relative">
                <textarea 
                  className="w-full p-8 pr-28 border-2 border-slate-100 rounded-[2rem] h-40 focus:ring-4 focus:ring-blue-100 outline-none text-xl font-medium" 
                  placeholder="Type Quran verse or upload a document for Tafsir..." 
                  value={tafsirInput} 
                  onChange={(e) => { setTafsirInput(e.target.value); setTafsirPayload(null); setTafsirFilePreview(null); }} 
                />
                <div className="absolute bottom-6 right-6 flex gap-3">
                  <button onClick={() => toggleDictation('tafsir')} className={`p-5 rounded-[1.5rem] shadow-xl transition-all ${isDictating === 'tafsir' ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Voice to Text">
                    {isDictating === 'tafsir' ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-6">
                <button disabled={loading || (!tafsirInput && !tafsirPayload)} onClick={() => handleAction(async () => { setTafsirResult(await generateTafsir(tafsirPayload || tafsirInput)); })} className="flex-[2] bg-blue-600 text-white py-5 rounded-[1.5rem] font-black hover:bg-blue-700 shadow-xl flex items-center justify-center gap-4">
                  {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit size={28} />} GENERATE TAFSIR
                </button>
                <label className="flex-1 cursor-pointer bg-slate-50 border-4 border-dashed border-slate-200 py-5 rounded-[1.5rem] font-black hover:bg-slate-100 flex flex-col items-center justify-center gap-2 group shadow-inner">
                  <div className="flex items-center gap-2"><Upload size={24} className="text-slate-500" /><span>UPLOAD</span></div>
                  <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'tafsir')} />
                </label>
              </div>
              <DocumentPreview preview={tafsirFilePreview} onClear={() => { setTafsirFilePreview(null); setTafsirPayload(null); setTafsirInput(''); }} />
            </div>

            {tafsirResult && (
              <div className="space-y-6 animate-in fade-in">
                {copiedMessage && (
                  <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-lg text-sm font-bold z-50 animate-in fade-in-up">
                    {copiedMessage}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4 bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-2xl">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-500">Toggles:</span>
                  <button onClick={() => setHideTamilTafsir(!hideTamilTafsir)} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all ${hideTamilTafsir ? 'bg-blue-600' : 'bg-slate-800 text-slate-400'}`}>{hideTamilTafsir ? <EyeOff size={16} /> : <Eye size={16} />} TAMIL</button>
                  <button onClick={() => setHideEnglishTafsir(!hideEnglishTafsir)} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all ${hideEnglishTafsir ? 'bg-indigo-600' : 'bg-slate-800 text-slate-400'}`}>{hideEnglishTafsir ? <EyeOff size={16} /> : <Eye size={16} />} ENGLISH</button>
                </div>
                <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
                  <div className="flex flex-col lg:flex-row divide-y lg:divide-x divide-slate-100">
                    {!hideTamilTafsir && (
                      <div className="flex-1 p-8 space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-blue-700 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-100">Tamil Tafsir</h3>
                            <div className="flex gap-2">
                                <button onClick={() => playingTafsirId === 'tafsir-tamil' ? stopAudio() : playRecitation(tafsirResult.tamilTafsir, 'tafsir-tamil', setPlayingTafsirId)} className={`p-3 rounded-xl transition-colors ${playingTafsirId === 'tafsir-tamil' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`} title="Listen to Tamil Tafsir">
                                    {playingTafsirId === 'tafsir-tamil' ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                                </button>
                                <button onClick={() => copyToClipboard(tafsirResult.tamilTafsir, "Tamil Tafsir Copied!")} className="p-3 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Copy Tamil Tafsir">
                                    <Clipboard size={18} />
                                </button>
                                <button onClick={() => handleNativeShare(`Quran Tafsir (Tamil)`, tafsirResult.tamilTafsir)} className="p-3 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Share Tamil Tafsir">
                                    <Share2 size={18} />
                                </button>
                            </div>
                        </div>
                        <p className="text-lg font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">{tafsirResult.tamilTafsir}</p>
                      </div>
                    )}
                    {!hideEnglishTafsir && (
                      <div className="flex-1 p-8 space-y-6">
                         <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">English Tafsir</h3>
                            <div className="flex gap-2">
                                <button onClick={() => playingTafsirId === 'tafsir-english' ? stopAudio() : playRecitation(tafsirResult.englishTafsir, 'tafsir-english', setPlayingTafsirId)} className={`p-3 rounded-xl transition-colors ${playingTafsirId === 'tafsir-english' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`} title="Listen to English Tafsir">
                                    {playingTafsirId === 'tafsir-english' ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                                </button>
                                <button onClick={() => copyToClipboard(tafsirResult.englishTafsir, "English Tafsir Copied!")} className="p-3 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Copy English Tafsir">
                                    <Clipboard size={18} />
                                </button>
                                <button onClick={() => handleNativeShare(`Quran Tafsir (English)`, tafsirResult.englishTafsir)} className="p-3 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Share English Tafsir">
                                    <Share2 size={18} />
                                </button>
                            </div>
                        </div>
                        <p className="text-base font-medium text-slate-600 leading-relaxed italic whitespace-pre-wrap">{tafsirResult.englishTafsir}</p>
                      </div>
                    )}
                  </div>
                  {/* General Share Button for both Tafsirs */}
                  {(tafsirResult.tamilTafsir || tafsirResult.englishTafsir) && (
                    <div className="p-8 border-t border-slate-100 flex justify-end">
                      <button 
                        onClick={() => handleNativeShare(
                          "Quran Tafsir", 
                          `Tamil Tafsir:\n${tafsirResult.tamilTafsir}\n\nEnglish Tafsir:\n${tafsirResult.englishTafsir}`
                        )} 
                        className="flex items-center gap-3 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-colors shadow-lg"
                        title="Share Both Tafsirs"
                      >
                        <Share2 size={18} /> SHARE ALL TAFSIR
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case AppView.TUTORIAL:
        return (
          <div className="p-10 max-w-5xl mx-auto space-y-16">
            <header className="text-center space-y-6">
              <div className="inline-block p-5 bg-indigo-100 rounded-3xl text-indigo-600"><Sparkles size={48} /></div>
              <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Mastering Learn Pro</h2>
              <p className="text-slate-500 text-xl font-medium leading-relaxed">Your professional AI suite for Quranic learning and memorization.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <TutorialStep title="Word Analysis" icon={<BookOpen size={32} />} color="emerald">Paste any verse or upload Mushaf photos to see a table of every word with Tamil meanings and audio.</TutorialStep>
              <TutorialStep title="Interactive Hifz" icon={<GraduationCap size={32} />} color="purple">Mask words to test your memory, then record your voice for a full AI audit of your accuracy and Tajweed.</TutorialStep>
              <TutorialStep title="Tafsir Explanations" icon={<FileText size={32} />} color="blue">Get in-depth explanations of any Quranic verse in both Tamil and English, perfect for deeper understanding.</TutorialStep> {/* NEW */}
              <TutorialStep title="Full Document" icon={<EyeIcon size={32} />} color="blue">Never lose context. Our AI extracts and displays the full document text from PDFs, Images, and Excel sheets.</TutorialStep>
              <TutorialStep title="Voice Dictation" icon={<Mic size={32} />} color="amber">Tired of typing? Use the microphone icon to speak directly into the input boxes. Supports multi-language detection.</TutorialStep>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(!sidebarOpen)} />}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-50 bg-white border-r-2 border-slate-100 transition-all duration-500 ${sidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 overflow-hidden shadow-2xl'}`}>
        <div className="h-full w-80 flex flex-col p-10">
          <div className="flex items-center gap-5 mb-14">
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-2xl shadow-indigo-200"><Settings size={28} /></div>
            <h1 className="font-black text-2xl tracking-tighter text-slate-900">Learn Pro</h1>
          </div>
          <nav className="flex-1 space-y-4">
            <SidebarItem icon={<LayoutDashboard size={24} />} label="DASHBOARD" active={activeView === AppView.DASHBOARD} onClick={() => setActiveView(AppView.DASHBOARD)} />
            <div className="py-10 px-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">MODULES</div>
            <SidebarItem icon={<BookOpen size={24} />} label="ANALYSIS LAB" active={activeView === AppView.QURAN} onClick={() => setActiveView(AppView.QURAN)} />
            <SidebarItem icon={<GraduationCap size={24} />} label="HIFZ STUDIO" active={activeView === AppView.HIFZ} onClick={() => setActiveView(AppView.HIFZ)} />
            <SidebarItem icon={<FileText size={24} />} label="TAFSIR LAB" active={activeView === AppView.TAFSIR} onClick={() => setActiveView(AppView.TAFSIR)} /> {/* NEW */}
            <SidebarItem icon={<HelpCircle size={24} />} label="RESOURCES" active={activeView === AppView.TUTORIAL} onClick={() => setActiveView(AppView.TUTORIAL)} />
          </nav>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <header className="h-24 bg-white/80 backdrop-blur-2xl border-b-2 border-slate-100 sticky top-0 z-30 flex items-center justify-between px-8 md:px-12">
          <div className="flex items-center gap-8">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-4 hover:bg-slate-100 rounded-2xl text-slate-600 transition-all"><Menu size={28} /></button>
            <h2 className="font-black text-slate-900 uppercase tracking-[0.2em] text-xs">{activeView.replace('_', ' ')}</h2>
          </div>
          <div className="h-14 w-14 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-lg ring-8 ring-indigo-50 shadow-inner">QL</div>
        </header>
        {error && <div className="m-10 p-8 bg-red-50 border-2 border-red-100 rounded-[2.5rem] text-red-600 font-black text-sm flex items-center gap-6 animate-in fade-in"><Info size={28} /> {error}<button onClick={() => setError(null)} className="ml-auto opacity-50"><X size={20} /></button></div>}
        <main className="flex-1 overflow-y-auto pb-24 scroll-smooth">{renderView()}</main>
      </div>
    </div>
  );
};

const FeatureCard: React.FC<{ title: string; desc: string; icon: React.ReactNode; onClick: () => void }> = ({ title, desc, icon, onClick }) => (
  <button onClick={onClick} className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 shadow-xl hover:shadow-3xl hover:-translate-y-4 transition-all duration-500 text-left flex flex-col gap-8 group">
    <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center group-hover:bg-indigo-50 transition-all shadow-inner border border-slate-100">{icon}</div>
    <div><h3 className="text-3xl font-black text-slate-900 tracking-tighter">{title}</h3><p className="text-slate-500 text-lg mt-3 leading-relaxed font-medium">{desc}</p></div>
    <div className="mt-6 flex items-center gap-4 text-indigo-600 font-black text-xs uppercase tracking-[0.3em]">Launch Module <ArrowRightCircle size={22} /></div>
  </button>
);

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-5 px-8 py-6 rounded-3xl transition-all duration-300 ${active ? 'bg-indigo-600 text-white shadow-2xl scale-105' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
    <div className={`${active ? 'text-white' : 'text-slate-400'} transition-all`}>{icon}</div>
    <span className="font-black text-sm tracking-widest">{label}</span>
  </button>
);

const InfoCard: React.FC<{ title: string; icon: React.ReactNode; color: string; children: React.ReactNode }> = ({ title, icon, color, children }) => (
  <div className={`bg-white p-10 rounded-[3.5rem] border-2 border-${color}-100 shadow-2xl`}>
    <h4 className={`font-black text-${color}-900 flex items-center gap-4 mb-8 uppercase tracking-[0.3em] text-[11px]`}>{icon} {title}</h4>
    {children}
  </div>
);

const TutorialStep: React.FC<{ title: string; icon: React.ReactNode; color: string; children: React.ReactNode }> = ({ title, icon, color, children }) => (
  <div className="bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-xl">
    <div className={`w-16 h-16 bg-${color}-100 text-${color}-600 rounded-2xl flex items-center justify-center mb-8 shadow-inner`}>{icon}</div>
    <h4 className="text-2xl font-black text-slate-900 mb-4">{title}</h4>
    <p className="text-slate-500 font-medium leading-relaxed">{children}</p>
  </div>
);

export default App;