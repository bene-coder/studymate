import { useState, useEffect, useRef, useCallback } from 'react';

import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useTheme } from './hooks/useTheme';
import { createFusionCoordinator } from './fusion/fusionCoordinator';
import { selectResponseStrategy } from './fusion/responseStrategy';
import { generateAdaptiveResponse } from './ai/responseGenerator';
import { db, createSession, addMessage, renameSession, finaliseSession } from './db/db';

import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import MobileDrawer from './components/MobileDrawer';

const MOBILE_BREAKPOINT = 768;

export default function App() {

  // ============================================================
  // THEME
  // ============================================================
  const { isDark, toggleTheme } = useTheme();

  // ============================================================
  // RESPONSIVE LAYOUT
  // ============================================================
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============================================================
  // ENGINE READINESS
  // ============================================================
  const [isReady, setIsReady] = useState({ whisper: false, afriberta: false });
  const modelsReady = isReady.whisper && isReady.afriberta;

  // ============================================================
  // SESSION + MESSAGE STATE
  // ============================================================
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionTopic, setSessionTopic] = useState('');       // pilot: what the student is studying
  const [showTopicPrompt, setShowTopicPrompt] = useState(false); // show topic input on new session

  const [pipelineStage, setPipelineStage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentEmotionalState, setCurrentEmotionalState] = useState(null);
  const [livePreviewText] = useState('');

  const turnIndexRef = useRef(0);
  const conversationHistoryRef = useRef([]);
  const latestStudentInputRef = useRef('');
  const latestInputModeRef = useRef('text');
  const pipelineTimeoutRef = useRef(null);

  const audioWorkerRef   = useRef(null);
  const emotionWorkerRef = useRef(null);
  const coordinatorRef   = useRef(null);

  // Track the active session id in a ref so beforeunload can read it
  // without capturing a stale closure value.
  const activeSessionIdRef = useRef(null);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Safety net: if a pipeline stage doesn't resolve within 25s, recover.
  useEffect(() => {
    if (pipelineTimeoutRef.current) {
      clearTimeout(pipelineTimeoutRef.current);
      pipelineTimeoutRef.current = null;
    }
    if (pipelineStage) {
      pipelineTimeoutRef.current = setTimeout(() => {
        console.warn(`⚠️ Pipeline stuck on "${pipelineStage}" for 25s — recovering`);
        coordinatorRef.current?.setAudioFallback();
        coordinatorRef.current?.setTextFallback();
      }, 25000);
    }
    return () => clearTimeout(pipelineTimeoutRef.current);
  }, [pipelineStage]);

  // ============================================================
  // SESSION DURATION — finalise when the tab closes or hides
  // Called on:
  //   1. beforeunload  — tab/window close or hard refresh
  //   2. visibilitychange → hidden  — phone lock, tab switch
  //   3. handleSelectSession / handleNewSession — explicit switch
  // ============================================================
  useEffect(() => {
    const handleUnload = () => {
      const id = activeSessionIdRef.current;
      if (id) finaliseSession(id);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const id = activeSessionIdRef.current;
        if (id) finaliseSession(id);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // ============================================================
  // BOOTSTRAP: load most recent session on first mount
  // ============================================================
  useEffect(() => {
    (async () => {
      const existing = await db.sessions.orderBy('updatedAt').reverse().first();
      if (existing) {
        setActiveSessionId(existing.id);
        setSessionTitle(existing.title);
        setSessionTopic(existing.topic ?? '');
        const pastMessages = await db.messages
          .where('sessionId').equals(existing.id).sortBy('createdAt');
        setMessages(pastMessages.map(m => ({ ...m, id: `db-${m.id}` })));
      } else {
        // First ever launch — show the topic prompt immediately
        const id = await createSession('New session');
        setActiveSessionId(id);
        setSessionTitle('New session');
        setSessionTopic('');
        setShowTopicPrompt(true);
      }
    })();
  }, []);

  // ============================================================
  // MESSAGE HELPERS
  // ============================================================
  const appendMessage = useCallback((msg) => {
    const localMsg = { id: `msg-${Date.now()}-${Math.random()}`, ...msg };
    setMessages(prev => [...prev, localMsg]);
    return localMsg;
  }, []);

  const updateLastAssistantMessage = useCallback((content, isStreaming) => {
    setMessages(prev => {
      const next = [...prev];
      const lastIdx = next.length - 1;
      if (lastIdx >= 0 && next[lastIdx].role === 'assistant') {
        next[lastIdx] = { ...next[lastIdx], content, isStreaming };
      }
      return next;
    });
  }, []);

  const persistMessage = useCallback(async (message) => {
    if (!activeSessionId) return;
    await addMessage(activeSessionId, message);
  }, [activeSessionId]);

  // ============================================================
  // SESSION NAVIGATION
  // ============================================================
  const handleSelectSession = useCallback(async (sessionId) => {
    // Finalise the outgoing session's duration before switching
    if (activeSessionIdRef.current && activeSessionIdRef.current !== sessionId) {
      await finaliseSession(activeSessionIdRef.current);
    }

    setActiveSessionId(sessionId);
    const session = await db.sessions.get(sessionId);
    setSessionTitle(session?.title ?? '');
    setSessionTopic(session?.topic ?? '');
    setShowTopicPrompt(false);

    const pastMessages = await db.messages
      .where('sessionId').equals(sessionId).sortBy('createdAt');
    setMessages(pastMessages.map(m => ({ ...m, id: `db-${m.id}` })));
    setCurrentEmotionalState(session?.lastEmotionalState ?? null);
    conversationHistoryRef.current = pastMessages.map(m => ({
      role: m.role,
      content: m.content,
    }));
    turnIndexRef.current = Math.floor(pastMessages.length / 2);
    if (isMobile) setIsDrawerOpen(false);
  }, [isMobile]);

  const handleNewSession = useCallback(async () => {
    // Finalise the outgoing session's duration before creating a new one
    if (activeSessionIdRef.current) {
      await finaliseSession(activeSessionIdRef.current);
    }

    const id = await createSession('New session');
    setActiveSessionId(id);
    setSessionTitle('New session');
    setSessionTopic('');
    setMessages([]);
    setCurrentEmotionalState(null);
    conversationHistoryRef.current = [];
    turnIndexRef.current = 0;
    setShowTopicPrompt(true); // prompt student to enter topic for this session
    if (isMobile) setIsDrawerOpen(false);
  }, [isMobile]);

  /**
   * Called when the student submits the topic input overlay.
   * Writes the topic to the DB and dismisses the prompt.
   */
  const handleTopicSubmit = useCallback(async (topic) => {
    setSessionTopic(topic);
    setShowTopicPrompt(false);
    if (activeSessionId && topic.trim()) {
      // Import updateSessionTopic lazily to avoid a circular dep concern — 
      // it's a thin wrapper around db.sessions.update.
      const { updateSessionTopic } = await import('./db/db');
      await updateSessionTopic(activeSessionId, topic.trim());
    }
  }, [activeSessionId]);

  // ============================================================
  // FUSION COMPLETE → ADAPTIVE RESPONSE
  // ============================================================
  const handleFusionComplete = useCallback((result) => {
    const { emotionalState, fusedScore, confidence, sessionId } = result;
    console.log(`🔀 Fusion [${sessionId}]: ${emotionalState} (score=${fusedScore}, conf=${confidence})`);

    setCurrentEmotionalState(emotionalState);

    const strategy = selectResponseStrategy(emotionalState, turnIndexRef.current);
    turnIndexRef.current += 1;

    setPipelineStage('generating');

    const currentInput = latestStudentInputRef.current;
    const currentInputMode = latestInputModeRef.current;

    persistMessage({
      role: 'user',
      content: currentInput,
      inputMode: currentInputMode,
      emotionalState,
      fusedScore,
    });

    appendMessage({ role: 'assistant', content: '', isStreaming: true });

    const streamBufferRef = { current: '' };

    generateAdaptiveResponse({
      studentInput: currentInput,
      emotionalState,
      responseStrategy: strategy,
      conversationHistory: conversationHistoryRef.current,

      onToken: (token) => {
        streamBufferRef.current += token;
        updateLastAssistantMessage(streamBufferRef.current, true);
      },

      onComplete: (fullResponse) => {
        updateLastAssistantMessage(fullResponse, false);
        setPipelineStage(null);
        setIsProcessing(false);

        persistMessage({ role: 'assistant', content: fullResponse });

        if (turnIndexRef.current === 1 && activeSessionId) {
          const autoTitle = currentInput.length > 40
            ? currentInput.slice(0, 40) + '…'
            : currentInput;
          renameSession(activeSessionId, autoTitle);
          setSessionTitle(autoTitle);
        }

        conversationHistoryRef.current = [
          ...conversationHistoryRef.current,
          { role: 'user', content: currentInput },
          { role: 'assistant', content: fullResponse },
        ];
        if (conversationHistoryRef.current.length > 12) {
          conversationHistoryRef.current = conversationHistoryRef.current.slice(-12);
        }
      },

      onError: (errorMsg) => {
        updateLastAssistantMessage(
          "I couldn't quite get a response through — check your connection and try again.",
          false
        );
        setPipelineStage(null);
        setIsProcessing(false);
        console.error('Response generation error:', errorMsg);
      },
    });

  }, [appendMessage, updateLastAssistantMessage, persistMessage, activeSessionId]);

  // ============================================================
  // AUDIO RECORDER HOOK
  // ============================================================
  const { isRecording, startRecording, stopRecording } = useAudioRecorder({
    onMFCCReady: (paralinguisticScore) => {
      coordinatorRef.current?.setAudioResult(paralinguisticScore);
    },
    onAudioReady: (pcmFloat32Array) => {
      setPipelineStage('transcribing');
      audioWorkerRef.current?.postMessage({
        type: 'TRANSCRIBE',
        audioArray: pcmFloat32Array,
        id: Date.now(),
      });
    },
    onStatusChange: () => {},
    onError: (msg) => {
      console.error('Audio error:', msg);
      coordinatorRef.current?.setAudioFallback();
    },
  });

  // ============================================================
  // WORKER LIFECYCLE
  // ============================================================
  useEffect(() => {
    audioWorkerRef.current = new Worker(
      new URL('./audioWorker.js', import.meta.url), { type: 'module' }
    );
    emotionWorkerRef.current = new Worker(
      new URL('./emotionWorker.js', import.meta.url), { type: 'module' }
    );

    audioWorkerRef.current.onmessage = (event) => {
      const { type, text, message } = event.data;

      if (type === 'AUDIO_WORKER_ALIVE' || type === 'READY' || type === 'WHISPER_READY') {
        setIsReady(prev => ({ ...prev, whisper: true }));
      }

      if (type === 'TRANSCRIPTION_RESULT') {
        latestStudentInputRef.current = text;
        latestInputModeRef.current = 'voice';
        appendMessage({ role: 'user', content: text, inputMode: 'voice' });
        setPipelineStage('analyzing');
        emotionWorkerRef.current?.postMessage({ type: 'TRANSCRIPTION_RESULT', text });
      }

      if (type === 'WHISPER_ERROR' || type === 'ERROR') {
        console.error('Whisper error:', message);
        if (message?.includes('No speech detected')) {
          appendMessage({
            role: 'assistant',
            content: "I didn't catch that. Try again or type your question instead.",
          });
        }
        coordinatorRef.current?.setTextFallback();
        setPipelineStage(null);
        setIsProcessing(false);
      }
    };

    emotionWorkerRef.current.onmessage = (event) => {
      const { type, status: workerStatus, sentiment, confidence } = event.data;

      if (type === 'AFRIBERTA_STATUS' && workerStatus === 'READY') {
        setIsReady(prev => ({ ...prev, afriberta: true }));
      }

      if (type === 'RESULT') {
        const numericConfidence = parseFloat(confidence) / 100;
        coordinatorRef.current?.setTextResult(sentiment, numericConfidence);
      }

      if (type === 'ERROR') {
        coordinatorRef.current?.setTextFallback();
        setPipelineStage(null);
        setIsProcessing(false);
      }
    };

    return () => {
      audioWorkerRef.current?.terminate();
      emotionWorkerRef.current?.terminate();
    };
  }, [appendMessage]);

  // ============================================================
  // INPUT HANDLERS
  // ============================================================
  const beginNewCoordinator = (sessionId) => {
    coordinatorRef.current = createFusionCoordinator(handleFusionComplete, sessionId);
  };

  const handleStartRecording = () => {
    beginNewCoordinator(`turn-${Date.now()}`);
    setIsProcessing(true);
    startRecording();
  };

  const handleSubmitText = (text) => {
    beginNewCoordinator(`turn-${Date.now()}`);
    coordinatorRef.current.setAudioFallback();

    latestStudentInputRef.current = text;
    latestInputModeRef.current = 'text';

    appendMessage({ role: 'user', content: text, inputMode: 'text' });
    setIsProcessing(true);
    setPipelineStage('analyzing');

    emotionWorkerRef.current?.postMessage({ type: 'START_CLASSIFICATION', text });
  };

  // ============================================================
  // RENDER
  // ============================================================
  const sidebarProps = {
    activeSessionId,
    onSelectSession: handleSelectSession,
    onNewSession: handleNewSession,
    modelsReady,
    studentName: 'Emmanuel',
    isDark,
    onToggleTheme: toggleTheme,
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden font-body">
      {!isMobile && <Sidebar {...sidebarProps} />}

      {isMobile && (
        <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
          <Sidebar {...sidebarProps} onClose={() => setIsDrawerOpen(false)} />
        </MobileDrawer>
      )}

      <ChatView
        sessionTitle={sessionTitle}
        sessionSubject={null}
        sessionTopic={sessionTopic}
        showTopicPrompt={showTopicPrompt}
        onTopicSubmit={handleTopicSubmit}
        messages={messages}
        currentEmotionalState={currentEmotionalState}
        pipelineStage={pipelineStage}
        isRecording={isRecording}
        isProcessing={isProcessing}
        livePreviewText={livePreviewText}
        onStartRecording={handleStartRecording}
        onStopRecording={stopRecording}
        onSubmitText={handleSubmitText}
        onOpenMenu={isMobile ? () => setIsDrawerOpen(true) : null}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />
    </div>
  );
}