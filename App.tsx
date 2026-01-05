
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
  Info,
  FileText,
  Image as ImageIcon,
  ArrowRightCircle,
  FileSpreadsheet,
  FileCode,
  Printer,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  PlayCircle,
  ArrowRight,
  FileDigit,
  Eye as EyeIcon
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
  const [quranPayload, setQuranPayload] = useState<any>(null);
  const [quranFilePreview, setQuranFilePreview] = useState<{type: 'image' | 'text', content: string} | null>(null);
  const [selectedQuranFileSize, setSelectedQuranFileSize] = useState<number | null>(null);
  const [hideTamilQuran, setHideTamilQuran] = useState(false);
  const [hideEnglishQuran, setHideEnglishQuran] = useState(false);
  const [peekIndices, setPeekIndices] = useState<Set<string>>(new Set());

  // Hifz state
  const [hifzInput, setHifzInput] = useState('');
  const [hifzChallenge, setHifzChallenge] = useState<HifzChallenge | null>(null);
  const [hifzPayload, setHifzPayload] = useState<any>(null);
  const [hifzFilePreview, setHifzFilePreview] = useState<{type: 'image' | 'text', content: string} | null>(null);
  const [selectedHifzFileSize, setSelectedHifzFileSize] = useState<number | null>(null);
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

  const printDocument = (title: string, content: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            h1 { text-align: center; color: #4f46e5; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
            .quran-text { font-family: 'Amiri', serif; font-size: 32px; direction: rtl; text-align: center; margin: 30px 0; background: #f8fafc; padding: 20px; border-radius: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; }
            .arabic-cell { font-family: 'Amiri', serif; font-size: 24px; text-align: right; }
            .section { margin-bottom: 30px; }
            .section-title { font-weight: bold; color: #334155; border-left: 4px solid #4f46e5; padding-left: 10px; margin-bottom: 10px; }
            .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${content}
          <div class="footer">Generated by Quran Learn Helper AI</div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintQuran = () => {
    if (quranResult.length === 0) return;
    
    let tableRows = quranResult.map(word => `
      <tr>
        <td class="arabic-cell">${word.arabic}</td>
        <td>${word.transliteration}</td>
        <td>${word.tamilMeaning}</td>
        <td>${word.englishMeaning}</td>
      </tr>
    `).join('');

    const content = `
      <div class="section">
        <div class="section-title">Word-by-Word Analysis</div>
        <table>
          <thead>
            <tr>
              <th>Arabic</th>
              <th>Transliteration</th>
              <th>Tamil Meaning</th>
              <th>English Meaning</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
    printDocument("Quranic Word Analysis", content);
  };

  const handlePrintHifz = () => {
    if (!hifzChallenge) return;

    const content = `
      <div class="section">
        <div class="section-title">Original Verse</div>
        <div class="quran-text">${hifzChallenge.originalVerse}</div>
      </div>
      <div class="section">
        <div class="section-title">Tajweed Rules (Tamil)</div>
        <p>${hifzChallenge.tajweedTamil}</p>
      </div>
      <div class="section">
        <div class="section-title">Tajweed Rules (English)</div>
        <p>${hifzChallenge.tajweedEnglish}</p>
      </div>
    `;
    printDocument("Hifz Study Sheet", content);
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
    setHifzFilePreview(null);
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
    setQuranPayload(null);
    setQuranFilePreview(null);
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

  const processFile = async (file: File): Promise<{ data: any; type: 'inline' | 'text'; preview: {type: 'image' | 'text', content: string} }> => {
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type === 'text/csv';
    const isWord = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');

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
          // For PDFs, we'll try to extract text for the preview using Gemini's extractText helper indirectly or just show that it's a PDF.
          // Since extractTextForReading is async and uses AI, we'll just store the payload and indicate it's a PDF.
          // In a real app, you might use a PDF library, but here we prioritize the extracted text later.
          resolve({ 
            data: { data: base64, mimeType: file.type }, 
            type: 'inline',
            preview: { type: 'text', content: `[PDF File Detected: ${file.name}] Processing for text extraction...` }
          });
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
          resolve({ 
            data: fullText, 
            type: 'text',
            preview: { type: 'text', content: fullText }
          });
        };
        reader.readAsArrayBuffer(file);
      });
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, onProcessed: (payload: any, preview: {type: 'image' | 'text', content: string}, name: string, size: number) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const result = await processFile(file);
      onProcessed(result.data, result.preview, file.name, file.size);
      
      // If it's a PDF, we try to extract the "full document text" using AI immediately for the preview
      if (file.type === 'application/pdf') {
        try {
          const extracted = await extractTextForReading(result.data);
          onProcessed(result.data, { type: 'text', content: extracted }, file.name, file.size);
        } catch (err) {
          console.warn("Could not extract PDF text for preview immediately.", err);
        }
      }
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

  const DocumentPreview = ({ preview, onClear }: { preview: {type: 'image' | 'text', content: string} | null, onClear: () => void }) => {
    if (!preview) return null;
    return (
      <div className="bg-slate-50 border-2 border-slate-200 rounded-[2rem] overflow-hidden mt-4 animate-in fade-in slide-in-from-top-4">
        <div className="flex items-center justify-between px-6 py-3 bg-slate-100 border-b-2 border-slate-200">
          <div className="flex items-center gap-2 text-slate-700 font-black text-[10px] uppercase tracking-widest">
            <EyeIcon size={14} /> Full Document Preview
          </div>
          <button onClick={onClear} className="text-slate-400 hover:text-red-500 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 max-h-[400px] overflow-y-auto">
          {preview.type === 'image' ? (
            <img src={preview.content} alt="Uploaded document preview" className="max-w-full rounded-xl shadow-lg mx-auto" />
          ) : (
            <div className="whitespace-pre-wrap font-medium text-slate-700 leading-relaxed text-sm bg-white p-6 rounded-xl shadow-inner border border-slate-200">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
            <FeatureCard 
              title="Quran Analysis Lab" 
              desc="Break down verses word-by-word with high-quality pronunciation and Tamil translations."
              icon={<BookOpen className="w-10 h-10 text-emerald-600" />}
              onClick={() => setActiveView(AppView.QURAN)}
            />
             <FeatureCard 
              title="Memorization Studio" 
              desc="Train for Hifz with AI-driven Tajweed coaching and multi-language feedback support."
              icon={<GraduationCap className="w-10 h-10 text-purple-600" />}
              onClick={() => setActiveView(AppView.HIFZ)}
            />
            <FeatureCard 
              title="Help & Tutorials" 
              desc="Learn how to use these tools effectively with illustrative guides and walkthroughs."
              icon={<HelpCircle className="w-10 h-10 text-blue-600" />}
              onClick={() => setActiveView(AppView.TUTORIAL)}
            />
          </div>
        );

      case AppView.TUTORIAL:
        return (
          <div className="p-8 max-w-6xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-6">
            <header className="text-center space-y-4">
              <div className="inline-block p-4 bg-indigo-100 rounded-3xl text-indigo-600 mb-2">
                <Sparkles size={40} />
              </div>
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">How to Use Study Pro</h2>
              <p className="text-slate-500 max-w-2xl mx-auto text-lg font-medium">Master the AI tools designed to enhance your Quranic studies and memorization journey.</p>
            </header>

            <div className="max-w-4xl mx-auto space-y-12">
              {/* Module 1 Section */}
              <div className="space-y-6 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black uppercase tracking-widest mx-auto">
                  <BookOpen size={16} /> Module 1
                </div>
                <h3 className="text-3xl font-black text-slate-800">Quran Analysis Lab</h3>
                <p className="text-slate-600 leading-relaxed text-lg max-w-2xl mx-auto">
                  Paste any Arabic verse or upload images of Mushaf pages, PDFs, or even Excel spreadsheets. 
                  Our AI identifies each word and provides its precise meaning in <span className="text-emerald-600 font-bold">Tamil</span> and <span className="text-indigo-600 font-bold">English</span>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
                  {[
                    "Word-by-word breakdown for deep understanding.",
                    "Correct pronunciation buttons for every single word.",
                    "Hide/Show language buttons for self-testing.",
                    "Print your analysis to a clean PDF study sheet."
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-slate-700 font-medium p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                      <div className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveView(AppView.QURAN)} className="flex items-center gap-2 bg-emerald-600 text-white px-10 py-4 rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 mx-auto">
                  Launch Analysis Lab <ArrowRight size={20} />
                </button>
              </div>

              <div className="h-px bg-slate-200 w-full" />

              {/* Module 2 Section */}
              <div className="space-y-6 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-xs font-black uppercase tracking-widest mx-auto">
                  <GraduationCap size={16} /> Module 2
                </div>
                <h3 className="text-3xl font-black text-slate-800">Memorization Studio</h3>
                <p className="text-slate-600 leading-relaxed text-lg max-w-2xl mx-auto">
                  Challenge your Hifz by masking specific words. Click on any word to hide or reveal it, 
                  helping you recall the verse mentally before reciting.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
                  {[
                    "Interactive masking to test your memory.",
                    "AI-driven Tajweed coaching in separate Tamil/English boxes.",
                    "Record your recitation for a full accuracy audit.",
                    "Detailed feedback on pronunciation and skipped words."
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-slate-700 font-medium p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                      <div className="mt-1 w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveView(AppView.HIFZ)} className="flex items-center gap-2 bg-purple-600 text-white px-10 py-4 rounded-2xl font-black hover:bg-purple-700 transition-all shadow-xl shadow-purple-100 mx-auto">
                  Launch Hifz Studio <ArrowRight size={20} />
                </button>
              </div>
            </div>

            <section className="bg-indigo-900 rounded-[3rem] p-12 text-white relative overflow-hidden text-center space-y-8">
              <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12"><HelpCircle size={160} /></div>
              <h3 className="text-3xl font-black relative z-10">Pro Tips for Best Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/10 backdrop-blur-md">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 mx-auto"><Upload size={24} /></div>
                  <h4 className="font-bold mb-2">Clear Uploads</h4>
                  <p className="text-sm text-indigo-100">Ensure photos of Mushaf pages are well-lit and the text is clear for the AI OCR to work perfectly.</p>
                </div>
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/10 backdrop-blur-md">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 mx-auto"><Mic size={24} /></div>
                  <h4 className="font-bold mb-2">Quiet Recording</h4>
                  <p className="text-sm text-indigo-100">When recording for AI Audit, try to be in a quiet room so the microphone captures only your voice.</p>
                </div>
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/10 backdrop-blur-md">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 mx-auto"><Eye size={24} /></div>
                  <h4 className="font-bold mb-2">Use Masking</h4>
                  <p className="text-sm text-indigo-100">Mask 2-3 words at a time initially, then use 'Mask Random' to challenge your brain's recall ability.</p>
                </div>
              </div>
            </section>
          </div>
        );

      case AppView.QURAN:
        return (
          <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-2xl font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BookOpen className="text-emerald-600" /> Quran Word Lab
              </span>
              <div className="flex gap-2">
                {quranResult.length > 0 && (
                  <button onClick={handlePrintQuran} className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 font-bold shadow-sm">
                    <Printer size={14} /> PRINT PDF
                  </button>
                )}
                <button onClick={resetQuran} className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 font-bold shadow-sm">
                  <Trash2 size={14} /> RESET
                </button>
              </div>
            </h2>
            <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
              {loading && uploadProgress > 0 && <ProgressBar progress={uploadProgress} color="bg-emerald-500" />}
              <div className="relative">
                <textarea 
                  className="w-full p-6 border-2 border-slate-100 rounded-[1.5rem] h-32 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-300 transition-all outline-none text-lg"
                  placeholder="Paste verse or upload a document..."
                  value={quranInput}
                  onChange={(e) => { setQuranInput(e.target.value); setQuranPayload(null); setQuranFilePreview(null); setSelectedQuranFileSize(null); }}
                />
                <button
                  onClick={() => handleReadAloud(quranInput, quranPayload, 'quran-input-read')}
                  className={`absolute bottom-4 right-4 p-4 rounded-2xl shadow-xl transition-all ${playingId === 'quran-input-read' ? 'bg-red-600 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {playingId === 'quran-input-read' ? <Square size={20} fill="currentColor" /> : <Volume2 size={20} />}
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  disabled={loading || (!quranInput && !quranPayload)}
                  onClick={() => handleAction(async () => { setQuranResult(await analyzeQuranVerse(quranPayload || quranInput)); })}
                  className="flex-1 bg-emerald-600 text-white py-4 px-4 rounded-2xl font-black hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 shadow-lg"
                >
                  {loading ? <Loader2 className="animate-spin" size={24} /> : <BrainCircuit size={24} />} ANALYZE VERSES
                </button>
                <label className="flex-[1.5] cursor-pointer bg-slate-50 border-4 border-dashed border-slate-200 text-slate-700 py-4 px-6 rounded-2xl font-black hover:bg-slate-100 transition-all flex flex-col items-center justify-center gap-2 group shadow-inner">
                  <div className="flex items-center gap-3"><Upload size={22} className="text-slate-500" /><span>UPLOAD FILE</span></div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-black"><span className="bg-white px-2 rounded border">PDF</span><span className="bg-white px-2 rounded border">IMG</span><span className="bg-white px-2 rounded border">XLS</span></div>
                  <input type="file" className="hidden" accept="image/*,application/pdf,.xlsx,.xls,.docx" onChange={(e) => handleFileUpload(e, (payload, preview, name, size) => { setQuranPayload(payload); setQuranFilePreview(preview); setQuranInput(`Loaded: ${name}`); setSelectedQuranFileSize(size); })} />
                </label>
              </div>

              <DocumentPreview preview={quranFilePreview} onClear={() => { setQuranFilePreview(null); setQuranPayload(null); setQuranInput(''); }} />
            </div>

            {quranResult.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 bg-slate-900 text-white p-5 rounded-[2rem] shadow-2xl">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-500">Toggles:</span>
                  <button onClick={() => setHideTamilQuran(!hideTamilQuran)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${hideTamilQuran ? 'bg-emerald-600' : 'bg-slate-800 text-slate-400'}`}>
                    {hideTamilQuran ? <EyeOff size={14} /> : <Eye size={14} />} TAMIL
                  </button>
                  <button onClick={() => setHideEnglishQuran(!hideEnglishQuran)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${hideEnglishQuran ? 'bg-indigo-600' : 'bg-slate-800 text-slate-400'}`}>
                    {hideEnglishQuran ? <EyeOff size={14} /> : <Eye size={14} />} ENGLISH
                  </button>
                  <div className="ml-auto flex items-center gap-3"><span className="text-xs font-black uppercase tracking-widest text-slate-500">Audio Speed:</span><SpeedSelector /></div>
                </div>
                <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-50 border-b-2 border-slate-100">
                      <tr>
                        <th className="px-6 py-5 text-left text-xs font-black text-slate-700 uppercase tracking-widest">Arabic Word</th>
                        <th className="px-6 py-5 text-left text-xs font-black text-slate-700 uppercase tracking-widest">Tamil Meaning</th>
                        <th className="px-6 py-5 text-left text-xs font-black text-slate-700 uppercase tracking-widest">English</th>
                        <th className="px-6 py-5 text-center text-xs font-black text-slate-700 uppercase tracking-widest">Pronounce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quranResult.map((word, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-6 font-quran text-4xl text-slate-900 text-right" dir="rtl">{word.arabic}</td>
                          <td className={`px-6 py-6 font-bold text-lg ${hideTamilQuran && !peekIndices.has(`${idx}-ta`) ? 'blur-md select-none opacity-20' : 'text-emerald-900'}`} onClick={() => hideTamilQuran && togglePeek(idx, 'ta')}>{word.tamilMeaning}</td>
                          <td className={`px-6 py-6 text-slate-600 font-medium ${hideEnglishQuran && !peekIndices.has(`${idx}-en`) ? 'blur-md select-none opacity-20' : ''}`} onClick={() => hideEnglishQuran && togglePeek(idx, 'en')}>{word.englishMeaning}</td>
                          <td className="px-6 py-6 text-center">
                            <button 
                              onClick={() => playingId === `word-${idx}` ? stopTTS() : playTTS(word.arabic, `word-${idx}`)} 
                              className={`p-4 rounded-2xl transition-all shadow-sm ${playingId === `word-${idx}` ? 'bg-red-50 text-red-600 scale-110' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:scale-105'}`}
                              title="Listen to this word correctly"
                            >
                              {playingId === `word-${idx}` ? <Square size={20} fill="currentColor" /> : <Volume2 size={20} />}
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
          <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-3"><GraduationCap className="text-purple-600" /> Memorization Studio</h2>
              <div className="flex gap-2">
                {hifzChallenge && <button onClick={handlePrintHifz} className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-600 hover:bg-blue-50 font-black shadow-sm"><Printer size={16} /> PRINT STUDY SHEET</button>}
                <button onClick={resetHifz} className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-400 hover:bg-red-50 font-black shadow-sm"><Trash2 size={16} /> CLEAR</button>
              </div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6">
                  <h3 className="font-black text-slate-800 flex items-center gap-3"><BookOpen size={22} className="text-purple-500" /> Verse Studio</h3>
                  {loading && uploadProgress > 0 && <ProgressBar progress={uploadProgress} color="bg-purple-500" />}
                  <textarea 
                    className="w-full p-6 border-2 border-slate-100 rounded-[1.5rem] h-28 focus:ring-4 focus:ring-purple-100 outline-none text-right font-quran text-3xl bg-slate-50" 
                    placeholder="Paste verse..." 
                    value={hifzInput} 
                    dir="rtl"
                    onChange={(e) => setHifzInput(e.target.value)} 
                  />
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button disabled={loading || !hifzInput} onClick={() => handleAction(async () => { setHifzChallenge(await analyzeHifzChallenge(hifzPayload || hifzInput)); setRecitationFeedback(null); })} className="flex-[2] bg-purple-600 text-white py-4 px-6 rounded-2xl font-black hover:bg-purple-700 shadow-lg flex items-center justify-center gap-3">
                      {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit size={24} />} ANALYZE & START
                    </button>
                    <label className="flex-1 cursor-pointer bg-slate-50 border-4 border-dashed border-slate-200 py-4 px-4 rounded-2xl font-black hover:bg-slate-100 flex flex-col items-center justify-center gap-1 shadow-inner">
                      <div className="flex items-center gap-2"><Upload size={20} /><span>FILE</span></div>
                      <input type="file" className="hidden" accept="image/*,application/pdf,.xlsx,.xls,.docx" onChange={(e) => handleFileUpload(e, (payload, preview, name, size) => { setHifzPayload(payload); setHifzFilePreview(preview); setHifzInput(`Loaded: ${name}`); setSelectedHifzFileSize(size); })} />
                    </label>
                  </div>

                  <DocumentPreview preview={hifzFilePreview} onClear={() => { setHifzFilePreview(null); setHifzPayload(null); setHifzInput(''); }} />
                </div>
                {hifzChallenge && (
                  <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl space-y-8 border-t-[12px] border-purple-500 relative overflow-hidden">
                    <div className="flex flex-col items-center gap-8 relative z-10">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300 bg-purple-900/50 px-6 py-2 rounded-full border border-purple-700/50">Recitation Playground</span>
                      <div className="flex flex-wrap gap-6 justify-center items-center w-full" dir="rtl">
                        {hifzChallenge.originalVerse.split(/\s+/).map((word, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-2">
                            <button onClick={() => toggleWordMask(idx)} className={`font-quran text-5xl leading-relaxed px-6 py-4 rounded-3xl transition-all ${hifzMaskedIndices.has(idx) ? 'bg-purple-800/20 text-purple-300/10 border-4 border-dashed border-purple-700/50 blur-[8px] scale-95' : 'bg-white/10 text-white border-4 border-white/5 shadow-xl hover:scale-110 active:scale-90'}`}>
                              {hifzMaskedIndices.has(idx) ? '____' : word}
                            </button>
                            <button onClick={() => playTTS(word, `hifz-word-${idx}`)} className={`p-2 rounded-full transition-all ${playingId === `hifz-word-${idx}` ? 'bg-red-500 text-white' : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/40'}`}>
                              <Volume2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="pt-8 border-t-2 border-slate-800 flex justify-center gap-6">
                      <button onClick={randomMaskHifz} className="flex items-center gap-2 px-6 py-3 bg-purple-700 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95"><RefreshCw size={14} /> MASK RANDOM</button>
                      <button onClick={clearMaskHifz} className="flex items-center gap-2 px-6 py-3 bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95"><Eye size={14} /> REVEAL ALL</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="lg:col-span-2 space-y-6">
                <div className="flex gap-4 p-4 bg-slate-900 rounded-[2rem] shadow-xl">
                  <button onClick={() => setHideTamilHifz(!hideTamilHifz)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${hideTamilHifz ? 'bg-emerald-600' : 'bg-slate-800 text-slate-500'}`}>
                    {hideTamilHifz ? <EyeOff size={14} /> : <Eye size={14} />} TAMIL
                  </button>
                  <button onClick={() => setHideEnglishHifz(!hideEnglishHifz)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${hideEnglishHifz ? 'bg-indigo-600' : 'bg-slate-800 text-slate-500'}`}>
                    {hideEnglishHifz ? <EyeOff size={14} /> : <Eye size={14} />} ENGLISH
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <InfoCard title="Tajweed Rules" icon={<Settings className="text-amber-500" />} color="amber">
                       <div className="space-y-4">
                         {!hideTamilHifz && <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-sm text-amber-900 font-bold"><p className="text-[10px] uppercase tracking-widest text-amber-600 mb-2">Tamil Guidance</p>{hifzChallenge?.tajweedTamil || "Upload to view..."}</div>}
                         {!hideEnglishHifz && <div className="p-4 bg-white rounded-2xl border border-amber-100 text-sm text-slate-700 font-medium"><p className="text-[10px] uppercase tracking-widest text-amber-600 mb-2">English Guidance</p>{hifzChallenge?.tajweedEnglish || "Upload to view..."}</div>}
                       </div>
                    </InfoCard>
                    <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl space-y-6 border-b-[12px] border-red-600/30">
                      <h3 className="font-black text-[10px] uppercase tracking-widest text-red-400">Voice Studio</h3>
                      <div className="flex flex-col items-center gap-6 py-8 border-4 border-dashed border-slate-800 rounded-[2.5rem] bg-slate-950/50">
                        <button onClick={isRecording ? stopRecording : startRecording} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-red-600 hover:scale-105'}`}>
                          {isRecording ? <Square size={24} fill="white" /> : <Mic size={36} className="text-white" />}
                        </button>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isRecording ? 'Capturing...' : 'Recite Now'}</span>
                      </div>
                      {recordedBlobUrl && !isRecording && (
                        <button onClick={() => handleAction(async () => { if (recordedAudio) setRecitationFeedback(await verifyRecitation(hifzInput, recordedAudio)); })} className="w-full py-4 bg-emerald-600 rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl active:scale-95">AUDIT RECITATION</button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <InfoCard title="Memorization Tips" icon={<Sparkles className="text-purple-500" />} color="purple">
                       <div className="space-y-4">
                         {!hideTamilHifz && <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 text-sm text-purple-900 font-bold"><p className="text-[10px] uppercase tracking-widest text-purple-600 mb-2">Tamil Tips</p>{hifzChallenge?.tipsTamil || "Analyze verse to get tips..."}</div>}
                         {!hideEnglishHifz && <div className="p-4 bg-white rounded-2xl border border-purple-100 text-sm text-slate-700 font-medium"><p className="text-[10px] uppercase tracking-widest text-purple-600 mb-2">English Tips</p>{hifzChallenge?.tipsEnglish || "Analyze verse to get tips..."}</div>}
                       </div>
                    </InfoCard>
                    <InfoCard title="AI Audit Feedback" icon={<CheckCircle2 className="text-emerald-500" />} color="emerald">
                      {recitationFeedback ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between mb-4"><span className="text-xs font-black uppercase tracking-widest text-slate-400">Accuracy Score:</span><span className="text-3xl font-black text-emerald-600">{recitationFeedback.accuracyScore}%</span></div>
                          {!hideTamilHifz && <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-sm text-emerald-900 font-bold"><p className="text-[10px] uppercase tracking-widest text-emerald-600 mb-2">Tamil Audit</p>{recitationFeedback.feedbackTamil}</div>}
                          {!hideEnglishHifz && <div className="p-4 bg-white rounded-2xl border border-emerald-100 text-sm text-slate-700 font-medium"><p className="text-[10px] uppercase tracking-widest text-emerald-600 mb-2">English Audit</p>{recitationFeedback.feedbackEnglish}</div>}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-xs italic font-bold">Perform a voice check to receive AI audit feedback.</p>
                      )}
                    </InfoCard>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-50 bg-white border-r-2 border-slate-100 transition-all duration-500 ${sidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 overflow-hidden'}`}>
        <div className="h-full w-72 flex flex-col p-8">
          <div className="flex items-center gap-4 mb-10"><div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-200"><Settings /></div><h1 className="font-black text-xl tracking-tight text-slate-800">Learn Pro</h1></div>
          <nav className="flex-1 space-y-3">
            <SidebarItem icon={<LayoutDashboard size={22} />} label="DASHBOARD" active={activeView === AppView.DASHBOARD} onClick={() => setActiveView(AppView.DASHBOARD)} />
            <div className="py-6 px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Learning Tools</div>
            <SidebarItem icon={<BookOpen size={22} />} label="ANALYSIS LAB" active={activeView === AppView.QURAN} onClick={() => setActiveView(AppView.QURAN)} />
            <SidebarItem icon={<GraduationCap size={22} />} label="HIFZ STUDIO" active={activeView === AppView.HIFZ} onClick={() => setActiveView(AppView.HIFZ)} />
            <SidebarItem icon={<HelpCircle size={22} />} label="HELP & TUTORIAL" active={activeView === AppView.TUTORIAL} onClick={() => setActiveView(AppView.TUTORIAL)} />
          </nav>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <header className="h-20 bg-white/80 backdrop-blur-xl border-b-2 border-slate-100 sticky top-0 z-30 flex items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-6">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-600 transition-all"><Menu size={26} /></button>
            <h2 className="font-black text-slate-800 uppercase tracking-widest text-sm">{activeView.replace('_', ' ')}</h2>
          </div>
          <div className="h-12 w-12 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-sm ring-4 ring-indigo-50">QL</div>
        </header>
        {error && <div className="m-8 p-6 bg-red-50 border-2 border-red-100 rounded-[2rem] text-red-600 font-black text-sm flex items-center gap-4 animate-in fade-in"><Info size={24} /> {error}</div>}
        <main className="flex-1 overflow-y-auto pb-20">{renderContent()}</main>
      </div>
    </div>
  );
};

const FeatureCard: React.FC<{ title: string; desc: string; icon: React.ReactNode; onClick: () => void }> = ({ title, desc, icon, onClick }) => (
  <button onClick={onClick} className="bg-white p-10 rounded-[3.5rem] border-2 border-slate-100 shadow-xl hover:shadow-2xl hover:-translate-y-3 transition-all text-left flex flex-col gap-6 group relative overflow-hidden">
    <div className="absolute -top-10 -right-10 p-20 opacity-5 group-hover:scale-150 transition-all duration-700">{icon}</div>
    <div className="p-6 bg-slate-50 rounded-3xl group-hover:bg-slate-100 group-hover:rotate-6 transition-all shadow-inner border-2 border-slate-100">{icon}</div>
    <div><h3 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h3><p className="text-slate-500 text-base mt-2 leading-relaxed font-medium">{desc}</p></div>
    <div className="mt-4 flex items-center gap-3 text-indigo-600 font-black text-xs uppercase tracking-[0.2em]">Launch Module <ArrowRightCircle size={18} className="group-hover:translate-x-2 transition-transform" /></div>
  </button>
);

const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl transition-all duration-300 ${active ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200 border-2 border-indigo-500' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 group'}`}>
    <div className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500 group-hover:scale-110'} transition-all`}>{icon}</div>
    <span className="font-black text-sm tracking-widest">{label}</span>
  </button>
);

const InfoCard: React.FC<{ title: string; icon: React.ReactNode; color: string; children: React.ReactNode }> = ({ title, icon, color, children }) => (
  <div className={`bg-white p-8 rounded-[2.5rem] border-2 border-${color}-100 shadow-xl group`}>
    <h4 className={`font-black text-${color}-900 flex items-center gap-3 mb-6 uppercase tracking-widest text-[10px]`}>{icon} {title}</h4>
    {children}
  </div>
);

export default App;
