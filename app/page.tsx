'use client';

import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';

type Message = {
  role: 'user' | 'model';
  content: string;
  imageUrl?: string;
  model?: string;
};

type Attachment = {
  name: string;
  mimeType: string;
  size: number;
  data?: string;
  text?: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

type ChatMode = 'standard' | 'think' | 'research';
type CreativeKind = 'image' | 'sticker';

type SpeechRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognizerConstructor = new () => SpeechRecognizer;

const STORAGE_KEY = 'ahmii-free-chat-conversations';
const MAX_FILE_SIZE = 60 * 1024 * 1024;
const MAX_ATTACHMENT_SIZE = 60 * 1024 * 1024;
const languages = ['Auto detect', 'English', 'Spanish', 'French', 'German', 'Arabic', 'Hindi', 'Urdu', 'Japanese', 'Korean', 'Chinese', 'Portuguese'];
const promptCategories = [
  { label: 'Study', description: 'Learn at your own pace with clear explanations, active recall, and manageable revision steps.', prompts: [
    { label: 'Explain simply', description: 'Break a difficult idea into plain language. Get an example that connects the idea to everyday life.', prompt: 'Explain this topic in simple terms, then give a clear example: ' },
    { label: 'Make flashcards', description: 'Turn class notes into short question-and-answer cards. Use them to practise remembering key facts.', prompt: 'Turn my notes into concise question-and-answer flashcards for revision: ' },
    { label: 'Quiz me', description: 'Practise with one question at a time. Answer first, then ask for a hint or explanation if you need one.', prompt: 'Create a 5-question quiz about this topic. Ask one question at a time and wait for my answer: ' },
    { label: 'Study plan', description: 'Build a realistic schedule from your goal, available time, and subject. Include small review sessions.', prompt: 'Make me a realistic study plan for learning this subject. Break it into short daily sessions: ' },
  ] },
  { label: 'Documents', description: 'Upload a PDF, DOCX, PPTX, or supported text file first, then choose how you want Ahmii to help.', prompts: [
    { label: 'Summarize a file', description: 'Get a short overview, the most important points, key terms, and a clear conclusion from your upload.', prompt: 'Summarize the attached file. Give me the key points, important terms, and a short conclusion.' },
    { label: 'Understand a concept', description: 'Find difficult ideas in your document and have them explained step by step in beginner-friendly language.', prompt: 'Using the attached document, explain the most difficult concepts step by step in plain language.' },
    { label: 'Create study notes', description: 'Organize the document into revision notes with useful headings, definitions, and facts to remember.', prompt: 'Turn the attached document into well-organized study notes with headings, definitions, and key facts.' },
    { label: 'Ask questions', description: 'Generate comprehension questions and answer keys from your file to check what you have learned.', prompt: 'Read the attached document and create 5 useful comprehension questions with answers.' },
  ] },
  { label: 'Projects', description: 'Move from a rough idea to practical next steps, stronger writing, and a presentation you can build on.', prompts: [
    { label: 'Plan my project', description: 'Break an idea into milestones, tasks, possible risks, and a timeline you can adjust.', prompt: 'Help me turn this project idea into a plan with milestones, tasks, risks, and a timeline: ' },
    { label: 'Brainstorm ideas', description: 'Explore several practical directions before choosing one. Ask for options tailored to your goal.', prompt: 'Suggest 10 original, practical ideas for this project. Add a one-line explanation for each: ' },
    { label: 'Improve my writing', description: 'Get feedback on clarity, flow, and structure while keeping your original meaning and voice.', prompt: 'Review this draft for clarity and structure. Suggest improvements while keeping my meaning: ' },
    { label: 'Prepare a presentation', description: 'Create a logical slide-by-slide outline with titles and key points to help you start your deck.', prompt: 'Create a concise presentation outline with slide titles and key points about: ' },
  ] },
];
const suggestions = [
  { icon: '✦', title: 'Brainstorm ideas', prompt: 'Help me brainstorm creative ideas for a project I am working on.' },
  { icon: '⌘', title: 'Write something', prompt: 'Help me write a clear, engaging piece about ' },
  { icon: '⌁', title: 'Learn a concept', prompt: 'Explain a complex concept simply, with an example.' },
  { icon: '▤', title: 'Analyze a file', prompt: 'Summarize the key points and insights from the file I attached.' },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const paths: Record<string, React.ReactNode> = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    paperclip: <><path d="m21 11.5-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z" /></>,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    camera: <><path d="M14 5h-4l-2 3H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-3l-2-3Z" /><circle cx="12" cy="13" r="3" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
    sticker: <><path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" /><path d="M20 13h-5a2 2 0 0 0-2 2v5l7-7Z" /><path d="M8 9h8M8 13h3" /></>,
  };
  return <svg {...shared}>{paths[name] ?? paths.sparkle}</svg>;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function extractPowerPointText(file: File) {
  const archive = await JSZip.loadAsync(file);
  const slideFiles = Object.keys(archive.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => Number(left.match(/slide(\d+)/)?.[1]) - Number(right.match(/slide(\d+)/)?.[1]));
  const slideTexts = await Promise.all(slideFiles.map(async (name, index) => {
    const xml = await archive.files[name].async('text');
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const text = Array.from(document.getElementsByTagNameNS('*', 't'))
      .map((node) => node.textContent?.trim())
      .filter((value): value is string => Boolean(value))
      .join(' ');
    return text ? `Slide ${index + 1}: ${text}` : '';
  }));
  const extractedText = slideTexts.filter(Boolean).join('\n\n');
  if (!extractedText) throw new Error('No readable text was found in this presentation.');
  return extractedText.slice(0, 80_000);
}

async function extractWordText(file: File) {
  const archive = await JSZip.loadAsync(file);
  const documentXml = archive.file('word/document.xml');
  if (!documentXml) throw new Error('Word document content was not found.');
  const xml = await documentXml.async('text');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = Array.from(document.getElementsByTagNameNS('*', 'p'))
    .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS('*', 't'))
      .map((node) => node.textContent || '')
      .join('')
      .trim())
    .filter(Boolean);
  if (!paragraphs.length) throw new Error('No readable text was found in this document.');
  return paragraphs.join('\n\n').slice(0, 80_000);
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('Auto detect');
  const [mode, setMode] = useState<ChatMode>('standard');
  const [creativeKind, setCreativeKind] = useState<CreativeKind | null>(null);
  const [listening, setListening] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [promptKitOpen, setPromptKitOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const speechRecognizerRef = useRef<SpeechRecognizer | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setConversations(JSON.parse(saved) as Conversation[]);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations, ready]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => speechRecognizerRef.current?.stop(), []);

  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
      void cameraVideoRef.current.play().catch(() => undefined);
    }
  }, [cameraStream, cameraOpen]);

  useEffect(() => () => cameraStream?.getTracks().forEach((track) => track.stop()), [cameraStream]);

  useEffect(() => {
    if (!toolsOpen && !promptKitOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setToolsOpen(false);
        setPromptKitOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [toolsOpen, promptKitOpen]);

  useEffect(() => {
    const closeFileMenu = () => setToolsOpen(false);
    const fileInput = fileInputRef.current;
    fileInput?.addEventListener('cancel', closeFileMenu);
    return () => {
      fileInput?.removeEventListener('cancel', closeFileMenu);
    };
  }, []);

  useEffect(() => {
    if (!toolsOpen && !promptKitOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('.composer-tools')) return;
      setToolsOpen(false);
      setPromptKitOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [toolsOpen, promptKitOpen]);

  const startNewChat = () => {
    speechRecognizerRef.current?.stop();
    setMessages([]);
    setActiveId('');
    setAttachments([]);
    setMode('standard');
    setCreativeKind(null);
    setSidebarOpen(false);
  };

  const openConversation = (conversation: Conversation) => {
    setMessages(conversation.messages);
    setActiveId(conversation.id);
    setAttachments([]);
    setSidebarOpen(false);
  };

  const clearSavedHistory = () => {
    if (!window.confirm('Delete all saved conversations from this browser? This cannot be undone.')) return;
    setConversations([]);
    setMessages([]);
    setActiveId('');
    setAttachments([]);
    setNotice('Saved conversations cleared from this browser.');
  };

  const closeCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraOpen(false);
  };

  const openCamera = async () => {
    setToolsOpen(false);
    setPromptKitOpen(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('Live camera needs HTTPS or localhost and a browser that supports camera access.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      const cameraError = error instanceof DOMException ? error.name : '';
      if (cameraError === 'NotAllowedError' || cameraError === 'SecurityError') {
        setNotice('Camera permission was blocked. Allow camera access in your browser settings, then try again.');
      } else if (cameraError === 'NotFoundError' || cameraError === 'DevicesNotFoundError') {
        setNotice('No camera was found on this device.');
      } else {
        setNotice('Could not open the camera. Check browser permissions or use Add photos & files instead.');
      }
    }
  };

  const captureCameraPhoto = async () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setNotice('Camera is still starting. Try the capture again in a moment.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setNotice('Could not capture this photo. Please try again.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
      setNotice('Could not save the captured photo. Please try again.');
      return;
    }
    const photo = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
    closeCamera();
    await addFiles([photo]);
  };

  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const next: Attachment[] = [];
    let totalSize = attachments.reduce((total, file) => total + file.size, 0);

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setNotice(`${file.name} is over the 60 MB per-file limit.`);
        continue;
      }
      if (totalSize + file.size > MAX_ATTACHMENT_SIZE) {
        setNotice(`${file.name} would exceed the 60 MB total attachment limit. Remove a file or choose a smaller one.`);
        continue;
      }
      if (file.type.startsWith('image/')) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          setNotice(`${file.name}: use a PNG, JPG, WEBP, or GIF image.`);
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read the image.'));
          reader.readAsDataURL(file);
        }).catch(() => '');
        if (dataUrl) {
          next.push({ name: file.name, mimeType: file.type, size: file.size, data: dataUrl.split(',')[1] });
          totalSize += file.size;
        }
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read the PDF.'));
          reader.readAsDataURL(file);
        }).catch(() => '');
        if (dataUrl) {
          next.push({ name: file.name, mimeType: 'application/pdf', size: file.size, data: dataUrl.split(',')[1] });
          totalSize += file.size;
        }
      } else if (file.name.toLowerCase().endsWith('.pptx')) {
        try {
          const text = await extractPowerPointText(file);
          next.push({ name: file.name, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: file.size, text });
          totalSize += file.size;
        } catch {
          setNotice(`${file.name}: couldn't read this PowerPoint. Try saving it as .pptx or exporting it as PDF.`);
        }
      } else if (file.name.toLowerCase().endsWith('.docx')) {
        try {
          const text = await extractWordText(file);
          next.push({ name: file.name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: file.size, text });
          totalSize += file.size;
        } catch {
          setNotice(`${file.name}: couldn't read this Word document. Try saving it as .docx or exporting it as PDF.`);
        }
      } else if (/^(text\/|application\/json)/.test(file.type) || /\.(txt|md|csv|json)$/i.test(file.name)) {
        const text = await file.text();
        next.push({ name: file.name, mimeType: file.type || 'text/plain', size: file.size, text: text.slice(0, 80_000) });
        totalSize += file.size;
      } else {
        setNotice(`${file.name}: supported files are images, PDF, DOCX, PPTX, TXT, MD, CSV, and JSON. Legacy .doc/.ppt files aren't supported.`);
      }
    }
    setAttachments((current) => [...current, ...next].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setPromptAndCloseKit = (prompt: string) => {
    setInput(prompt);
    setPromptKitOpen(false);
  };

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if ((!input.trim() && attachments.length === 0) || loading) return;

    const userPrompt = input.trim() || (creativeKind ? 'Create a visual based on the prompt above.' : 'Please review the attached file(s).');
    if (creativeKind && !input.trim()) {
      setNotice(`Describe the ${creativeKind} you want to create first.`);
      return;
    }
    const sentAttachments = attachments;
    const updatedMessages: Message[] = [...messages, { role: 'user', content: userPrompt }];
    const userTurn = [...updatedMessages];
    setMessages(updatedMessages);
    setInput('');
    setAttachments([]);
    setLoading(true);
    setNotice('');

    try {
      const res = await fetch(creativeKind ? '/api/image' : '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creativeKind
          ? { prompt: userPrompt, kind: creativeKind }
          : { message: userPrompt, history: messages, attachments: sentAttachments, language, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not get a response.');
      const reply = creativeKind
        ? (typeof data.imageUrl === 'string' ? (creativeKind === 'sticker' ? 'Your sticker is ready.' : 'Your image is ready.') : 'No image was returned.')
        : (typeof data.reply === 'string' ? data.reply : 'No reply received.');
      const nextMessages: Message[] = [...userTurn, { role: 'model', content: reply, ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}), ...(data.model ? { model: data.model } : {}) }];
      setMessages(nextMessages);
      setCreativeKind(null);
      const id = activeId || makeId();
      setActiveId(id);
      setConversations((current) => {
        const title = messages.length === 0 ? userPrompt.slice(0, 42) : current.find((chat) => chat.id === id)?.title || userPrompt.slice(0, 42);
        const updated = { id, title, messages: nextMessages.map(({ role, content, model }) => ({ role, content, model })), updatedAt: Date.now() };
        return [updated, ...current.filter((chat) => chat.id !== id)].slice(0, 30);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setMessages([...userTurn, { role: 'model', content: `I couldn't complete that request. ${message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const removeConversation = (id: string) => {
    setConversations((current) => current.filter((chat) => chat.id !== id));
    if (activeId === id) startNewChat();
  };

  const exportConversation = () => {
    if (!messages.length) {
      setNotice('Send a message before exporting a conversation.');
      return;
    }
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'free-chat-conversation.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const speakMessage = (content: string) => {
    if (!('speechSynthesis' in window)) {
      setNotice('Text-to-speech is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceInput = () => {
    if (speechRecognizerRef.current) {
      speechRecognizerRef.current.stop();
      return;
    }
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognizerConstructor; webkitSpeechRecognition?: SpeechRecognizerConstructor };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Voice typing is not supported in this browser. Try a recent version of Chrome or Edge.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'Auto detect' ? navigator.language : ({ English: 'en-US', Spanish: 'es-ES', French: 'fr-FR', German: 'de-DE', Arabic: 'ar-SA', Hindi: 'hi-IN', Urdu: 'ur-PK', Japanese: 'ja-JP', Korean: 'ko-KR', Chinese: 'zh-CN', Portuguese: 'pt-BR' }[language] || navigator.language);
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length - event.resultIndex }, (_, index) => event.results[event.resultIndex + index][0].transcript).join(' ');
      if (transcript) setInput((current) => `${current}${current ? ' ' : ''}${transcript}`);
    };
    recognition.onerror = () => setNotice('Microphone access failed. Allow microphone permission and try again.');
    recognition.onend = () => {
      speechRecognizerRef.current = null;
      setListening(false);
    };
    speechRecognizerRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      speechRecognizerRef.current = null;
      setListening(false);
      setNotice('Could not start voice typing. Check microphone permission and try again.');
    }
  };

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setNotice('Copied to clipboard.');
    } catch {
      setNotice('Clipboard access is unavailable in this browser.');
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void addFiles(event.dataTransfer.files);
  };

  return (
    <main className="app-shell">
      {sidebarOpen && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Icon name="sparkle" size={21} /></div>
          <div><strong>free chat app</strong><span>by ahmii</span></div>
          <button className="icon-button mobile-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><Icon name="close" /></button>
        </div>
        <button className="new-chat-button" onClick={startNewChat}><Icon name="plus" size={17} /> <span>New chat</span><kbd>⌘ K</kbd></button>
        <div className="sidebar-label">YOUR SPACE</div>
        <div className="history-heading"><span>Recent conversations</span><span className="history-count">{conversations.length}</span></div>
        <div className="conversation-list">
          {conversations.length === 0 ? <p className="empty-history">Your conversations will show up here.</p> : conversations.map((chat) => (
            <div key={chat.id} className={`history-item ${activeId === chat.id ? 'history-active' : ''}`}>
              <button className="history-open" onClick={() => openConversation(chat)} title={chat.title}><Icon name="message" size={16} /><span>{chat.title}</span></button>
              <button className="history-delete" aria-label={`Delete ${chat.title}`} onClick={() => removeConversation(chat.id)}><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-note"><span className="privacy-dot" /><div><strong>Your privacy matters</strong><span>Chat history stays in this browser. Prompts you send are processed by Google Gemini.</span><button type="button" className="clear-history-button" onClick={clearSavedHistory}>Clear saved history</button></div></div>
          <div className="profile-row"><div className="avatar">A</div><div className="profile-copy"><strong>Ahmii</strong><span>Free plan</span></div><button className="icon-button export-button" title="Export conversation" onClick={exportConversation}><Icon name="download" size={17} /></button></div>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button><div className="mobile-brand"><span className="brand-mark small"><Icon name="sparkle" size={16} /></span><strong>free chat app <em>by ahmii</em></strong></div><div className="model-pill"><span className="online-dot" /> Gemini · Free</div></div>
          <div className="topbar-actions"><label className="language-picker"><span className="language-icon">文</span><select aria-label="Response language" value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map((item) => <option key={item}>{item}</option>)}</select><span className="chevron">⌄</span></label><button className="icon-button export-top" title="Export conversation" aria-label="Export conversation" onClick={exportConversation}><Icon name="download" size={17} /></button></div>
        </header>

        <div className="conversation-area" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          {messages.length === 0 ? (
            <div className="welcome-wrap">
              <div className="welcome-orb"><Icon name="sparkle" size={30} /></div>
              <div className="eyebrow"><span /> A LITTLE MORE HUMAN, A LOT MORE HELPFUL</div>
              <h1>What can I help<br className="mobile-break" /> you <span>dream up?</span></h1>
              <p className="welcome-subtitle">A thoughtful space to explore ideas, get things done, and make something wonderful.</p>
              <div className="suggestion-grid">{suggestions.map((item) => <button key={item.title} className="suggestion-card" onClick={() => setInput(item.prompt)}><span className="suggestion-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.title === 'Analyze a file' ? 'Get insights from an upload' : item.title === 'Learn a concept' ? 'Make the tricky feel simple' : item.title === 'Write something' ? 'Find the words you need' : 'Start with a spark'}</small></span><span className="suggestion-arrow">↗</span></button>)}</div>
              <div className="creative-shortcuts"><button onClick={() => { setCreativeKind('image'); setInput('Create an image of '); }}><Icon name="image" size={16} /> Create image</button><button onClick={() => { setCreativeKind('sticker'); setInput('Create a cute sticker of '); }}><Icon name="sticker" size={16} /> Create sticker</button></div>
              <div className="welcome-footnote"><span>✳</span> Upload a file, choose a language, or just ask away.</div>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((msg, index) => <article key={`${index}-${msg.role}`} className={`message-row ${msg.role === 'user' ? 'user-row' : 'assistant-row'}`}>
                {msg.role === 'model' && <div className="assistant-avatar"><Icon name="sparkle" size={17} /></div>}
                <div className={`message-content ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}>
                  {msg.role === 'model' && <div className="message-label">AHMII AI{msg.model && <><span>·</span>{msg.model.toUpperCase()}</>}</div>}
                  <div className="message-text">{msg.content}</div>
                  {msg.imageUrl && <div className="generated-image-card"><img src={msg.imageUrl} alt={msg.content} /><a href={msg.imageUrl} download={msg.content.toLowerCase().includes('sticker') ? 'ahmii-sticker.png' : 'ahmii-created-image.png'}><Icon name="download" size={15} /> Download</a></div>}
                  {msg.role === 'model' && <div className="message-tools"><button onClick={() => void copyMessage(msg.content)}><Icon name="copy" size={14} /> Copy</button><button onClick={() => speakMessage(msg.content)}><Icon name="volume" size={14} /> Listen</button></div>}
                </div>
              </article>)}
              {loading && <div className="message-row assistant-row"><div className="assistant-avatar"><Icon name="sparkle" size={17} /></div><div className="thinking-card"><span className="thinking-dots"><i /><i /><i /></span><span>{creativeKind ? `Creating your ${creativeKind}` : mode === 'research' ? 'Researching the web' : mode === 'think' ? 'Thinking it through' : 'Thinking'}…</span></div></div>}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="composer-wrap">
          {attachments.length > 0 && <div className="attachment-tray">{attachments.map((file, index) => <div className="attachment-chip" key={`${file.name}-${index}`}><span className="file-icon"><Icon name={file.mimeType.startsWith('image/') ? 'image' : 'message'} size={16} /></span><span className="file-name"><strong>{file.name}</strong><small>{file.mimeType.startsWith('image/') ? 'Image' : file.mimeType === 'application/pdf' ? 'PDF · including scanned pages' : file.name.toLowerCase().endsWith('.pptx') ? 'PowerPoint · slide text extracted' : file.name.toLowerCase().endsWith('.docx') ? 'Word · document text extracted' : 'Text file'}</small></span><button aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}><Icon name="close" size={15} /></button></div>)}</div>}
          <form className="composer" onSubmit={handleSubmit}>
            {creativeKind && <div className="creation-banner"><span><Icon name={creativeKind === 'sticker' ? 'sticker' : 'image'} size={15} /> {creativeKind === 'sticker' ? 'Sticker studio' : 'Image studio'}</span><button type="button" onClick={() => setCreativeKind(null)} aria-label="Cancel image creation"><Icon name="close" size={15} /></button></div>}
            {(listening || promptKitOpen) && <div className="composer-status" role="status">{listening ? <><span className="recording-indicator" /> Voice typing is on — speak now, then tap Voice to stop.</> : <><Icon name="sparkle" size={14} /> Prompt Kit is open. Choose a prompt or close it to return to chat.</>}</div>}
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSubmit(); } }} placeholder={creativeKind ? `Describe your ${creativeKind}...` : 'Ask Ahmii anything...'} aria-label="Message free chat app" rows={1} disabled={loading} />
            <div className="composer-bottom"><div className="composer-tools">
              <input ref={fileInputRef} className="visually-hidden" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,.txt,.md,.csv,.json" onChange={(event) => { if (event.target.files) void addFiles(event.target.files); setToolsOpen(false); }} />
              <button type="button" className="tool-button" onClick={() => { setToolsOpen((open) => !open); setPromptKitOpen(false); }} aria-label="Open tools" aria-expanded={toolsOpen || promptKitOpen} aria-haspopup="menu"><Icon name="plus" size={18} /></button>
              <button type="button" className={`tool-button composer-shortcut ${listening ? 'tool-active recording' : ''}`} onClick={toggleVoiceInput} aria-pressed={listening} title={listening ? 'Stop voice typing' : 'Speak to fill in your message'}><Icon name="mic" size={16} /><span>{listening ? 'Stop' : 'Voice'}</span></button>
              <button type="button" className={`tool-button composer-shortcut ${promptKitOpen ? 'tool-active' : ''}`} onClick={() => { setToolsOpen(false); setPromptKitOpen((open) => !open); }} aria-expanded={promptKitOpen} aria-label="Open prompt kit" title="Open study, document, and project prompts"><Icon name="sparkle" size={16} /><span>Prompt Kit</span></button>
              {(toolsOpen || promptKitOpen) && <button type="button" aria-label="Close tools menu" className="tools-menu-backdrop" onClick={() => { setToolsOpen(false); setPromptKitOpen(false); }} />}
              {toolsOpen && <div className="tools-menu" role="menu">
                <div className="tools-menu-heading">Add to your message</div>
                <button type="button" className="tools-menu-item" role="menuitem" onClick={() => fileInputRef.current?.click()}><span className="tools-menu-icon"><Icon name="paperclip" size={17} /></span><span><strong>Add photos &amp; files</strong><small>Any supported file · 60 MB max per file and per message</small></span></button>
                <button type="button" className="tools-menu-item" role="menuitem" onClick={() => void openCamera()}><span className="tools-menu-icon tools-blue"><Icon name="camera" size={17} /></span><span><strong>Open camera</strong><small>Take a photo here, or use your device camera</small></span></button>
                <button type="button" className="tools-menu-item" role="menuitem" onClick={() => { setToolsOpen(false); toggleVoiceInput(); }}><span className="tools-menu-icon tools-teal"><Icon name="mic" size={17} /></span><span><strong>{listening ? 'Stop voice typing' : 'Voice message'}</strong><small>{listening ? 'Tap to stop dictation' : 'Speak to fill in your message'}</small></span></button>
                <button type="button" className="tools-menu-item" role="menuitem" onClick={() => { setToolsOpen(false); setPromptKitOpen(true); }}><span className="tools-menu-icon tools-purple"><Icon name="sparkle" size={17} /></span><span><strong>Prompt kit</strong><small>Study, document, and project prompts</small></span></button>
                <div className="tools-menu-separator" />
                <button type="button" className="tools-menu-item" role="menuitem" onClick={() => { setToolsOpen(false); setCreativeKind('image'); setInput((current) => current || 'Create an image of '); }}><span className="tools-menu-icon tools-yellow"><Icon name="image" size={17} /></span><span><strong>Create image</strong><small>Generate an original AI visual</small></span></button>
                <button type="button" className="tools-menu-item" role="menuitem" onClick={() => { setToolsOpen(false); setCreativeKind('sticker'); setInput((current) => current || 'Create a cute sticker of '); }}><span className="tools-menu-icon tools-pink"><Icon name="sticker" size={17} /></span><span><strong>Create sticker</strong><small>Make a custom sticker design</small></span></button>
                <div className="tools-menu-separator" />
                <button type="button" className={`tools-menu-item ${mode === 'research' ? 'tools-menu-selected' : ''}`} role="menuitem" onClick={() => { setToolsOpen(false); setMode(mode === 'research' ? 'standard' : 'research'); }}><span className="tools-menu-icon tools-blue"><Icon name="globe" size={17} /></span><span><strong>Web search</strong><small>{mode === 'research' ? 'Turn off current web research' : 'Find recent information online'}</small></span></button>
                <button type="button" className={`tools-menu-item ${mode === 'think' ? 'tools-menu-selected' : ''}`} role="menuitem" onClick={() => { setToolsOpen(false); setMode(mode === 'think' ? 'standard' : 'think'); }}><span className="tools-menu-icon tools-purple"><Icon name="sparkle" size={17} /></span><span><strong>Think deeper</strong><small>{mode === 'think' ? 'Turn off deeper reasoning' : 'Ask for a more considered answer'}</small></span></button>
              </div>}
              {promptKitOpen && <section className="tools-menu prompt-kit-menu" aria-label="Ahmii prompt kit">
                <div className="prompt-library-heading"><div><span className="prompt-kicker">AHMII PROMPT KIT</span><h2>Choose a quick prompt</h2></div><button type="button" className="prompt-kit-close" aria-label="Close prompt kit" onClick={() => setPromptKitOpen(false)}><Icon name="close" size={16} /></button></div>
                <p className="prompt-library-intro">Pick a prompt to put it in the composer, then edit or send it.</p>
                <div className="prompt-categories">{promptCategories.map((category) => <div className="prompt-category" key={category.label}><h3>{category.label}</h3><p className="prompt-category-description">{category.description}</p><div className="prompt-chip-list">{category.prompts.map((item) => <button type="button" key={item.label} className="prompt-card" title={`${item.description} Prompt: ${item.prompt}`} onClick={() => { setPromptAndCloseKit(item.prompt); if (category.label === 'Documents' && attachments.length === 0) fileInputRef.current?.click(); }}><span className="prompt-card-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="prompt-card-arrow">↗</span></button>)}</div></div>)}</div>
                <div className="prompt-library-note">For file help: attach a PDF, DOCX, or PPTX; select a Documents prompt, then send your message.</div>
              </section>}
            </div><button className="send-button" type="submit" aria-label={creativeKind ? 'Generate image' : 'Send message'} disabled={loading || (!input.trim() && attachments.length === 0)}><Icon name={creativeKind ? 'sparkle' : 'send'} size={17} /></button></div>
          </form>
          <div className="composer-caption"><span>Free chat app can make mistakes. Check important information.</span><span>{attachments.length ? '60 MB total · 60 MB/file' : language !== 'Auto detect' ? `Replies in ${language}` : 'Files up to 60 MB · Shift + Enter for a new line'}</span></div>
        </div>
      </section>
      {cameraOpen && <div className="camera-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) closeCamera(); }}>
        <section className="camera-dialog" role="dialog" aria-modal="true" aria-label="Take a photo">
          <div className="camera-dialog-heading"><div><strong>Take a photo</strong><span>Your photo is only added after you capture it.</span></div><button type="button" className="prompt-kit-close" aria-label="Close camera" onClick={closeCamera}><Icon name="close" size={17} /></button></div>
          <video ref={cameraVideoRef} className="camera-preview" autoPlay playsInline muted />
          <div className="camera-dialog-actions"><button type="button" className="camera-cancel" onClick={closeCamera}>Cancel</button><button type="button" className="camera-capture" onClick={() => void captureCameraPhoto()}><Icon name="camera" size={17} /> Capture photo</button></div>
        </section>
      </div>}
      {notice && <div className="toast" role="status"><Icon name="check" size={16} />{notice}</div>}
    </main>
  );
}
