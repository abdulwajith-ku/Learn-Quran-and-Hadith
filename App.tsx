
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
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { AppView, QuranWord, HifzChallenge, RecitationFeedback } from './types';
import { 
  analyzeQuranVerse, 
  generateSpeech,
  analyzeHifzChallenge,
  verifyRecitation,
  extractTextForReading
} from './services/geminiService';

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
  const [quranPayload, setQuranPayload] = useState<any>(null);
  const [quranFilePreview, setQuranFilePreview] = useState<{type: 'image' | 'text', content: string} | null>(null);
  const [hideTamilQuran, setHideTamilQuran] = useState(false);
  const [hideEnglishQuran, setHideEnglishQuran] = useState(false);
  const [peekIndices, setPeekIndices] = useState<Set<string>>(new Set());

  // Hifz state
  const [hifzInput, setHifzInput] = useState('');
  const [hifzChallenge, setHifzChallenge] = useState<HifzChallenge | null>(null);
  const [hifzPayload, setHifzPayload] = useState<any>(null);
  const [hifzFilePreview, setHifzFilePreview] = useState<{type: 'image' | 'text', content: string} | null>(null);
  const [hifzMaskedIndices, setHifzMaskedIndices] = useState<Set<number>>(new Set());
  const [recitationFeedback, setRecitationFeedback] = useState<RecitationFeedback | null>(null);
  const [hideTamilHifz, setHideTamilHifz] = useState(false);
  const [hideEnglishHifz, setHideEnglishHifz] = useState(false);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<{data: string, mimeType: string} | null>(null);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Audio handling
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
      } catch (e) {}
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

  const handlePrintQuran = () => {
    if (quranResult.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    let tableRows = quranResult.map(word => `
      <tr>
        <td style="font-family: 'Amiri', serif; font-size: 24px; text-align: right; border: 1px solid #e2e8f0; padding: 12px;">${word.arabic}</td>
        <td style="border: 1px solid #e2e8f0; padding: 12px;">${word.transliteration}</td>
        <td style="border: 1px solid #e2e8f0; padding: 12px;">${word.tamilMeaning}</td>
        <td style="border: 1px solid #e2e8f0; padding: 12px;">${word.englishMeaning}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Quran Word Analysis</title>
          <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: sans-serif; padding: 40px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f1f5f9; padding: 12px; border: 1px solid #e2e8f0; text-align: left; }
          </style>
        </head>
        <body>
          <h1 style="text-align: center;">Quranic Word Analysis</h1>
          <table>
            <thead>
              <tr>
                <th>Arabic</th>
                <th>Transliteration</th>
                <th>Tamil</th>
                <th>English</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const processFile = async (file: File): Promise<{ data: any; type: 'inline' | 'text'; preview: {type: 'image' | 'text', content: string} }> => {
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    const isExcel = file.type.includes('spreadsheet') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type === 'text/csv';
    const isWord = file.type.includes('word') || file.name.endsWith('.docx');

    if (isImage) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          const fullDataUrl = e.target?.result as string;
          resolve({ 
            data: { data: base64, mimeType: file.type }, 
            type: 'inline',
            preview: { type: 'image', content: fullDataUrl }
          });
        };
        reader.readAsDataURL(file);
      });
    }

    if (isPdf) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          resolve({ 
            data: { data: base64, mimeType: file.type }, 
            type: 'inline',
            preview: { type: 'text', content: `[PDF File Detected: ${file.name}] Processing...` }
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
      return { 
        data: fullText, 
        type: 'text',
        preview: { type: 'text', content: fullText }
      };
    }

    if (isWord) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { 
        data: result.value, 
        type: 'text',
        preview: { type: 'text', content: result.value }
      };
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        resolve({ 
          data: text, 
          type: 'text',
          preview: { type: 'text', content: text }
        });
      };
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'quran' | 'hifz') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const result = await processFile(file);
      if (type === 'quran') {
        setQuranPayload(result.data);
        setQuranFilePreview(result.preview);
        setQuranInput(`Loaded: ${file.name}`);
        if (file.type === 'application/pdf') {
          const extracted = await extractTextForReading(result.data);
          setQuranFilePreview({ type: 'text', content: extracted });
        }
      } else {
        setHifzPayload(result.data);
        setHifzFilePreview(result.preview);
        setHifzInput(`Loaded: ${file.name}`);
        if (file.type === 'application/pdf') {
          const extracted = await extractTextForReading(result.data);
          setHifzFilePreview({ type: 'text', content: extracted });
        }
      }
    } catch (err: any) {
      setError(`Failed to process file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleWordMask = (index: number) => {
    const newMask = new Set(hifzMaskedIndices);
    if (newMask.has(index)) newMask.delete(index);
    else newMask.add(index);
    setHifzMaskedIndices(newMask);
  };

  const resetQuran = () => {
    setQuranInput('');
    setQuranResult([]);
    setQuranPayload(null);
    setQuranFilePreview(null);
    setPeekIndices(new Set());
  };

  const resetHifz = () => {
    setHifzInput('');
    setHifzChallenge(null);
    setHifzPayload(null);
    setHifzFilePreview(null);
    setRecitationFeedback(null);
    setRecordedAudio(null);
    setRecordedBlobUrl(null);
    setIsRecording(false);
    setHifzMaskedIndices(new Set());
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
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAction = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const DocumentPreview = ({ preview, onClear }: { preview: {type: 'image' | 'text', content: string} | null, onClear: () => void }) => {
    const [copied, setCopied] = useState(false);
    if (!preview) return null;

    const copyToClipboard = () => {
      if (preview.type === 'text') {
        navigator.clipboard.writeText(preview.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    return (
      <div className="bg-slate-50 border-2 border-slate-200 rounded-[2rem] overflow-hidden mt-6 animate-in fade-in slide-in-from-top-4">
        <div className="flex items-center justify-between px-8 py-4 bg-slate-100 border-b-2 border-slate-200">
          <div className="flex items-center gap-2 text-slate-700 font-black text-xs uppercase tracking-widest">
            <EyeIcon size={16} /> FULL DOCUMENT PREVIEW
          </div>
          <div className="flex items-center gap-2">
            {preview.type === 'text' && (
              <button onClick={copyToClipboard} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 text-[10px] font-bold">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />} 
                {copied ? 'COPIED' : 'COPY TEXT'}
              </button>
            )}
            <button onClick={onClear} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-8 max-h-[500px] overflow-y-auto">
          {preview.type === 'image' ? (
            <img src={preview.content} alt="Uploaded source" className="max-w-full rounded-2xl shadow-2xl mx-auto border-4 border-white" />
          ) : (
            <div className="whitespace-pre-wrap font-medium text-slate-800 leading-relaxed text-sm bg-white p-8 rounded-2xl shadow-inner border border-slate-200">
              {preview.content}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeView) {
      case AppView.DASHBOARD:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-10 max-w-7xl mx-auto animate-in fade-in duration-500">
            <FeatureCard 
              title="Quran Analysis Lab" 
              desc="Break down verses word-by-word with high-quality pronunciation and Tamil translations."
              icon={<BookOpen className="w-10 h-10 text-emerald-600" />}
              onClick={() => setActiveView(AppView.QURAN)}
            />
             <FeatureCard 
              title="Memorization Studio" 
              desc="Train for Hifz with AI-driven Tajweed coaching and masking technology."
              icon={<GraduationCap className="w-10 h-10 text-purple-600" />}
              onClick={() => setActiveView(AppView.HIFZ)}
            />
            <FeatureCard 
              title="Help & Tutorials" 
              desc="Learn how to use these tools effectively with illustrative guides."
              icon={<HelpCircle className="w-10 h-10 text-blue-600" />}
              onClick={() => setActiveView(AppView.TUTORIAL)}
            />
          </div>
        );

      case AppView.QURAN:
        return (
          <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
            <h2 className="text-3xl font-black flex items-center justify-between text-slate-900">
              <span className="flex items-center gap-3">
                <BookOpen className="text-emerald-600" /> Quran Analysis Lab
              </span>
              <div className="flex gap-3">
                {quranResult.length > 0 && (
                  <button onClick={handlePrintQuran} className="text-xs flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-600 hover:bg-blue-50 font-black shadow-sm">
                    <Printer size={16} /> PRINT PDF
                  </button>
                )}
                <button onClick={resetQuran} className="text-xs flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-400 hover:bg-red-50 font-black shadow-sm">
                  <Trash2 size={16} /> RESET
                </button>
              </div>
            </h2>
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 space-y-6">
              <div className="relative">
                <textarea 
                  className="w-full p-8 border-2 border-slate-100 rounded-[2rem] h-40 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-300 transition-all outline-none text-xl font-medium"
                  placeholder="Paste Quranic verse here or upload a file..."
                  value={quranInput}
                  onChange={(e) => { setQuranInput(e.target.value); setQuranPayload(null); setQuranFilePreview(null); }}
                />
                <button
                  onClick={() => handleReadAloud(quranInput, quranPayload, 'quran-input-read')}
                  className={`absolute bottom-6 right-6 p-5 rounded-[1.5rem] shadow-2xl transition-all ${playingId === 'quran-input-read' ? 'bg-red-600 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {playingId === 'quran-input-read' ? <Square size={24} fill="currentColor" /> : <Volume2 size={24} />}
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-6">
                <button 
                  disabled={loading || (!quranInput && !quranPayload)}
                  onClick={() => handleAction(async () => { setQuranResult(await analyzeQuranVerse(quranPayload || quranInput)); })}
                  className="flex-[2] bg-emerald-600 text-white py-5 px-8 rounded-[1.5rem] font-black hover:bg-emerald-700 transition-all flex items-center justify-center gap-4 shadow-xl shadow-emerald-100"
                >
                  {loading ? <Loader2 className="animate-spin" size={28} /> : <BrainCircuit size={28} />} ANALYZE VERSES
                </button>
                <label className="flex-1 cursor-pointer bg-slate-50 border-4 border-dashed border-slate-200 py-5 px-8 rounded-[1.5rem] font-black hover:bg-slate-100 transition-all flex flex-col items-center justify-center gap-2 group shadow-inner">
                  <div className="flex items-center gap-3"><Upload size={24} className="text-slate-500 group-hover:scale-110 transition-transform" /><span>UPLOAD</span></div>
                  <input type="file" className="hidden" accept="image/*,application/pdf,.xlsx,.xls,.docx,.csv" onChange={(e) => handleFileUpload(e, 'quran')} />
                </label>
              </div>
              <DocumentPreview preview={quranFilePreview} onClear={() => { setQuranFilePreview(null); setQuranPayload(null); setQuranInput(''); }} />
            </div>

            {quranResult.length > 0 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8">
                <div className="flex flex-wrap items-center gap-4 bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-2xl">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-500">Self-Testing:</span>
                  <button onClick={() => setHideTamilQuran(!hideTamilQuran)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${hideTamilQuran ? 'bg-emerald-600' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                    {hideTamilQuran ? <EyeOff size={16} /> : <Eye size={16} />} TAMIL
                  </button>
                  <button onClick={() => setHideEnglishQuran(!hideEnglishQuran)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${hideEnglishQuran ? 'bg-indigo-600' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                    {hideEnglishQuran ? <EyeOff size={16} /> : <Eye size={16} />} ENGLISH
                  </button>
                  <div className="ml-auto flex items-center gap-4">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">Recitation Speed:</span>
                    <div className="flex bg-slate-800 rounded-lg p-1">
                      {[1, 1.5, 2].map(s => (
                        <button key={s} onClick={() => setPlaybackSpeed(s)} className={`px-3 py-1 text-[10px] font-bold rounded ${playbackSpeed === s ? 'bg-indigo-600' : 'hover:bg-slate-700'}`}>{s}x</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-50 border-b-2 border-slate-100">
                      <tr>
                        <th className="px-8 py-6 text-left text-xs font-black text-slate-700 uppercase tracking-widest">Arabic Word</th>
                        <th className="px-8 py-6 text-left text-xs font-black text-slate-700 uppercase tracking-widest">Tamil Meaning</th>
                        <th className="px-8 py-6 text-left text-xs font-black text-slate-700 uppercase tracking-widest">English</th>
                        <th className="px-8 py-6 text-center text-xs font-black text-slate-700 uppercase tracking-widest">Audio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quranResult.map((word, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-8 py-8 font-quran text-5xl text-slate-900 text-right" dir="rtl">{word.arabic}</td>
                          <td className={`px-8 py-8 font-bold text-xl cursor-pointer ${hideTamilQuran && !peekIndices.has(`${idx}-ta`) ? 'blur-lg select-none opacity-20' : 'text-emerald-900'}`} onClick={() => hideTamilQuran && setPeekIndices(prev => { const n = new Set(prev); n.has(`${idx}-ta`) ? n.delete(`${idx}-ta`) : n.add(`${idx}-ta`); return n; })}>{word.tamilMeaning}</td>
                          <td className={`px-8 py-8 text-slate-600 font-semibold cursor-pointer ${hideEnglishQuran && !peekIndices.has(`${idx}-en`) ? 'blur-lg select-none opacity-20' : ''}`} onClick={() => hideEnglishQuran && setPeekIndices(prev => { const n = new Set(prev); n.has(`${idx}-en`) ? n.delete(`${idx}-en`) : n.add(`${idx}-en`); return n; })}>{word.englishMeaning}</td>
                          <td className="px-8 py-8 text-center">
                            <button onClick={() => playingId === `w-${idx}` ? stopTTS() : playTTS(word.arabic, `w-${idx}`)} className={`p-5 rounded-[1.2rem] shadow-sm transition-all ${playingId === `w-${idx}` ? 'bg-red-50 text-red-600 scale-110' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
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
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <h2 className="text-3xl font-black flex items-center gap-4 text-slate-900"><GraduationCap className="text-purple-600" /> Memorization Studio</h2>
              <div className="flex gap-3">
                <button onClick={resetHifz} className="text-xs flex items-center gap-2 bg-white border border-slate-200 px-5 py-2.5 rounded-xl text-slate-400 hover:bg-red-50 font-black shadow-sm transition-all"><Trash2 size={18} /> CLEAR STUDIO</button>
              </div>
            </header>
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-10">
              <div className="xl:col-span-3 space-y-8">
                <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100 space-y-8">
                  <h3 className="font-black text-slate-800 flex items-center gap-4 text-lg"><BookOpen size={24} className="text-purple-500" /> Verse Workbench</h3>
                  <textarea 
                    className="w-full p-8 border-2 border-slate-100 rounded-[2rem] h-32 focus:ring-4 focus:ring-purple-100 outline-none text-right font-quran text-4xl bg-slate-50 leading-relaxed" 
                    placeholder="Enter verse to memorize..." 
                    value={hifzInput} 
                    dir="rtl"
                    onChange={(e) => setHifzInput(e.target.value)} 
                  />
                  <div className="flex flex-col sm:flex-row gap-6">
                    <button disabled={loading || !hifzInput} onClick={() => handleAction(async () => { setHifzChallenge(await analyzeHifzChallenge(hifzPayload || hifzInput)); setRecitationFeedback(null); })} className="flex-[2] bg-purple-600 text-white py-5 px-8 rounded-[1.5rem] font-black hover:bg-purple-700 shadow-xl shadow-purple-100 flex items-center justify-center gap-4 transition-all active:scale-95">
                      {loading ? <Loader2 className="animate-spin" size={24} /> : <BrainCircuit size={28} />} START TRAINING
                    </button>
                    <label className="flex-1 cursor-pointer bg-slate-50 border-4 border-dashed border-slate-200 py-5 px-8 rounded-[1.5rem] font-black hover:bg-slate-100 flex flex-col items-center justify-center gap-1 shadow-inner transition-all">
                      <div className="flex items-center gap-2"><Upload size={22} /><span>FILE</span></div>
                      <input type="file" className="hidden" accept="image/*,application/pdf,.xlsx,.xls,.docx,.csv" onChange={(e) => handleFileUpload(e, 'hifz')} />
                    </label>
                  </div>
                  <DocumentPreview preview={hifzFilePreview} onClear={() => { setHifzFilePreview(null); setHifzPayload(null); setHifzInput(''); }} />
                </div>

                {hifzChallenge && (
                  <div className="bg-slate-900 text-white p-12 rounded-[3.5rem] shadow-2xl space-y-10 border-t-[16px] border-purple-500 relative overflow-hidden animate-in zoom-in-95 duration-500">
                    <div className="flex flex-col items-center gap-10 relative z-10">
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-300 bg-purple-900/50 px-8 py-3 rounded-full border border-purple-700/50 shadow-inner">Interactive Memorizer</span>
                      <div className="flex flex-wrap gap-8 justify-center items-center w-full" dir="rtl">
                        {hifzChallenge.originalVerse.split(/\s+/).map((word, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-4">
                            <button onClick={() => toggleWordMask(idx)} className={`font-quran text-6xl leading-tight px-8 py-6 rounded-[2rem] transition-all duration-300 ${hifzMaskedIndices.has(idx) ? 'bg-purple-800/30 text-transparent border-4 border-dashed border-purple-700/50 blur-[12px] scale-95' : 'bg-white/10 text-white border-4 border-white/5 shadow-2xl hover:scale-110 active:scale-90 hover:bg-white/20'}`}>
                              {word}
                            </button>
                            <button onClick={() => playTTS(word, `hw-${idx}`)} className={`p-3 rounded-full transition-all ${playingId === `hw-${idx}` ? 'bg-red-500 text-white' : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/40'}`}>
                              <Volume2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="pt-10 border-t-2 border-slate-800 flex justify-center gap-8">
                      <button onClick={() => { const words = hifzChallenge.originalVerse.split(/\s+/); const n = new Set<number>(); words.forEach((_, i) => { if(Math.random() < 0.4) n.add(i); }); setHifzMaskedIndices(n); }} className="flex items-center gap-3 px-8 py-4 bg-purple-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-800 transition-all shadow-lg active:scale-95"><RefreshCw size={18} /> MASK RANDOM</button>
                      <button onClick={() => setHifzMaskedIndices(new Set())} className="flex items-center gap-3 px-8 py-4 bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all shadow-lg active:scale-95"><Eye size={18} /> SHOW ALL</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="xl:col-span-2 space-y-10">
                <div className="flex gap-4 p-5 bg-slate-900 rounded-[2.5rem] shadow-2xl border-b-4 border-slate-800">
                  <button onClick={() => setHideTamilHifz(!hideTamilHifz)} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black transition-all ${hideTamilHifz ? 'bg-emerald-600 shadow-lg' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                    {hideTamilHifz ? <EyeOff size={18} /> : <Eye size={18} />} TAMIL
                  </button>
                  <button onClick={() => setHideEnglishHifz(!hideEnglishHifz)} className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black transition-all ${hideEnglishHifz ? 'bg-indigo-600 shadow-lg' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                    {hideEnglishHifz ? <EyeOff size={18} /> : <Eye size={18} />} ENGLISH
                  </button>
                </div>
                <div className="space-y-8">
                  <InfoCard title="Tajweed Rules" icon={<Settings className="text-amber-500" />} color="amber">
                    <div className="space-y-6">
                      {!hideTamilHifz && <div className="p-6 bg-amber-50 rounded-3xl border-2 border-amber-100 text-base text-amber-900 font-bold leading-relaxed shadow-sm"><p className="text-[10px] uppercase tracking-widest text-amber-600 mb-3 font-black">TAMIL GUIDANCE</p>{hifzChallenge?.tajweedTamil || "Upload to view rules..."}</div>}
                      {!hideEnglishHifz && <div className="p-6 bg-white rounded-3xl border-2 border-amber-100 text-base text-slate-700 font-medium leading-relaxed shadow-sm"><p className="text-[10px] uppercase tracking-widest text-amber-600 mb-3 font-black">ENGLISH GUIDANCE</p>{hifzChallenge?.tajweedEnglish || "Upload to view rules..."}</div>}
                    </div>
                  </InfoCard>
                  
                  <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl space-y-8 border-b-[12px] border-red-600/30">
                    <h3 className="font-black text-[10px] uppercase tracking-widest text-red-400">Voice Recitation Audit</h3>
                    <div className="flex flex-col items-center gap-8 py-10 border-4 border-dashed border-slate-800 rounded-[2.5rem] bg-slate-950/50">
                      <button onClick={isRecording ? stopRecording : startRecording} className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-red-600 hover:scale-110 active:scale-95'}`}>
                        {isRecording ? <Square size={32} fill="white" /> : <Mic size={40} className="text-white" />}
                      </button>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isRecording ? 'Capturing Recitation...' : 'Tap Mic to Recite'}</span>
                    </div>
                    {recordedBlobUrl && !isRecording && (
                      <button onClick={() => handleAction(async () => { if (recordedAudio) setRecitationFeedback(await verifyRecitation(hifzInput, recordedAudio)); })} className="w-full py-5 bg-emerald-600 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-xs shadow-2xl hover:bg-emerald-700 transition-all active:scale-95">AUDIT MY RECITATION</button>
                    )}
                    {recitationFeedback && (
                      <div className="space-y-6 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/10"><span className="text-xs font-black uppercase tracking-widest text-slate-400">Accuracy Score:</span><span className="text-4xl font-black text-emerald-400">{recitationFeedback.accuracyScore}%</span></div>
                        {!hideTamilHifz && <div className="p-6 bg-emerald-950/40 rounded-2xl border border-emerald-900/50 text-base text-emerald-100 font-bold leading-relaxed">{recitationFeedback.feedbackTamil}</div>}
                        {!hideEnglishHifz && <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700 text-base text-slate-300 font-medium leading-relaxed">{recitationFeedback.feedbackEnglish}</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case AppView.TUTORIAL:
        return (
          <div className="p-10 max-w-5xl mx-auto space-y-16 animate-in fade-in duration-700">
            <header className="text-center space-y-6">
              <div className="inline-block p-5 bg-indigo-100 rounded-3xl text-indigo-600 mb-2 shadow-xl shadow-indigo-50"><Sparkles size={48} /></div>
              <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Mastering Learn Pro</h2>
              <p className="text-slate-500 max-w-3xl mx-auto text-xl font-medium leading-relaxed">Your AI-driven companion for deepening Quranic understanding and perfecting memorization.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <TutorialStep title="Quran Lab" icon={<BookOpen size={32} />} color="emerald">
                Paste verses, upload photos of Mushaf, or even CSV files. The AI extracts every word, analyzes its root meaning, and provides high-quality recitation audio with Tamil guidance.
              </TutorialStep>
              <TutorialStep title="Hifz Studio" icon={<GraduationCap size={32} />} color="purple">
                The ultimate tool for memorization. Use Interactive Masking to hide words and test your recall. Record your voice for an AI Audit that scores your accuracy and Tajweed.
              </TutorialStep>
              <TutorialStep title="Full Doc Preview" icon={<EyeIcon size={32} />} color="blue">
                Upload images, PDFs, Excel sheets, or Word docs. Learn Pro shows you the full original document alongside the analysis, so you never lose context of the source text.
              </TutorialStep>
              <TutorialStep title="Self-Testing" icon={<CheckCircle2 size={32} />} color="amber">
                Use the "Toggles" to hide Tamil or English meanings. Hover or click to "Peek" at meanings during your study session to reinforce long-term memory.
              </TutorialStep>
            </div>
            <div className="bg-indigo-900 rounded-[3rem] p-12 text-white relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 p-16 opacity-10 rotate-12"><Info size={200} /></div>
              <h3 className="text-3xl font-black mb-6 relative z-10">Pro Deployment Tip</h3>
              <p className="text-indigo-100 text-lg relative z-10 leading-relaxed max-w-2xl">Deploying to <strong>Vercel</strong>? Ensure you select the <strong>Vite</strong> framework preset. The modern ES6 architecture of Learn Pro is optimized for high-performance edge deployment via Vite.</p>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-50 bg-white border-r-2 border-slate-100 transition-all duration-500 ease-in-out ${sidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 overflow-hidden shadow-2xl'}`}>
        <div className="h-full w-80 flex flex-col p-10">
          <div className="flex items-center gap-5 mb-14">
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-2xl shadow-indigo-200 ring-4 ring-indigo-50"><Settings size={28} /></div>
            <h1 className="font-black text-2xl tracking-tighter text-slate-900">Learn Pro</h1>
          </div>
          <nav className="flex-1 space-y-4">
            <SidebarItem icon={<LayoutDashboard size={24} />} label="DASHBOARD" active={activeView === AppView.DASHBOARD} onClick={() => setActiveView(AppView.DASHBOARD)} />
            <div className="py-10 px-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">ACADEMY MODULES</div>
            <SidebarItem icon={<BookOpen size={24} />} label="ANALYSIS LAB" active={activeView === AppView.QURAN} onClick={() => setActiveView(AppView.QURAN)} />
            <SidebarItem icon={<GraduationCap size={24} />} label="HIFZ STUDIO" active={activeView === AppView.HIFZ} onClick={() => setActiveView(AppView.HIFZ)} />
            <SidebarItem icon={<HelpCircle size={24} />} label="RESOURCES" active={activeView === AppView.TUTORIAL} onClick={() => setActiveView(AppView.TUTORIAL)} />
          </nav>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <header className="h-24 bg-white/80 backdrop-blur-2xl border-b-2 border-slate-100 sticky top-0 z-30 flex items-center justify-between px-8 md:px-12">
          <div className="flex items-center gap-8">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-4 hover:bg-slate-100 rounded-2xl text-slate-600 transition-all active:scale-90"><Menu size={28} /></button>
            <h2 className="font-black text-slate-900 uppercase tracking-[0.2em] text-xs">{activeView.replace('_', ' ')}</h2>
          </div>
          <div className="h-14 w-14 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-lg ring-8 ring-indigo-50/50 shadow-inner">QL</div>
        </header>
        {error && <div className="m-10 p-8 bg-red-50 border-2 border-red-100 rounded-[2.5rem] text-red-600 font-black text-sm flex items-center gap-6 animate-in fade-in slide-in-from-top-4 shadow-xl shadow-red-50"><Info size={28} /> {error}<button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100"><X size={20} /></button></div>}
        <main className="flex-1 overflow-y-auto pb-24 scroll-smooth">{renderContent()}</main>
      </div>
    </div>
  );
};

const FeatureCard: React.FC<{ title: string; desc: string; icon: React.ReactNode; onClick: () => void }> = ({ title, desc, icon, onClick }) => (
  <button onClick={onClick} className="bg-white p-12 rounded-[4rem] border-2 border-slate-100 shadow-xl hover:shadow-3xl hover:-translate-y-4 transition-all duration-500 text-left flex flex-col gap-8 group relative overflow-hidden">
    <div className="absolute -top-12 -right-12 p-24 opacity-5 group-hover:scale-150 group-hover:rotate-12 transition-all duration-1000">{icon}</div>
    <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center group-hover:bg-indigo-50 group-hover:rotate-6 transition-all shadow-inner border border-slate-100">{icon}</div>
    <div><h3 className="text-3xl font-black text-slate-900 tracking-tighter">{title}</h3><p className="text-slate-500 text-lg mt-3 leading-relaxed font-medium">{desc}</p></div>
    <div className="mt-6 flex items-center gap-4 text-indigo-600 font-black text-xs uppercase tracking-[0.3em] group-hover:gap-6 transition-all">Launch Module <ArrowRightCircle size={22} /></div>
  </button>
);

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-5 px-8 py-6 rounded-3xl transition-all duration-300 ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-100 scale-105' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 group'}`}>
    <div className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500 group-hover:scale-125'} transition-all duration-500`}>{icon}</div>
    <span className="font-black text-sm tracking-widest">{label}</span>
  </button>
);

const InfoCard: React.FC<{ title: string; icon: React.ReactNode; color: string; children: React.ReactNode }> = ({ title, icon, color, children }) => (
  <div className={`bg-white p-10 rounded-[3.5rem] border-2 border-${color}-100 shadow-2xl group transition-all`}>
    <h4 className={`font-black text-${color}-900 flex items-center gap-4 mb-8 uppercase tracking-[0.3em] text-[11px]`}>{icon} {title}</h4>
    {children}
  </div>
);

const TutorialStep: React.FC<{ title: string; icon: React.ReactNode; color: string; children: React.ReactNode }> = ({ title, icon, color, children }) => (
  <div className="bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-xl hover:shadow-2xl transition-all duration-500">
    <div className={`w-16 h-16 bg-${color}-100 text-${color}-600 rounded-2xl flex items-center justify-center mb-8 shadow-inner`}>{icon}</div>
    <h4 className="text-2xl font-black text-slate-900 mb-4">{title}</h4>
    <p className="text-slate-500 font-medium leading-relaxed">{children}</p>
  </div>
);

export default App;
