import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Search,
  BookOpen,
  FileText,
  Video,
  Image,
  MessageCircle,
  Send,
  File,
} from 'lucide-react';
import { useMaterials } from '../contexts/MaterialsContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import { sendKnowledgeBasedChat, checkAiServiceAvailable } from '../lib/aiChat';
import { buildKnowledgeContext } from '../lib/buildKnowledgeContext';
import { materialHasFiles, type Material, type MaterialType } from '../types/material';
import ChatMessageContent from './ChatMessageContent';

interface Message {
  id: number;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

function getMaterialIcon(type: MaterialType) {
  switch (type) {
    case '视频':
      return Video;
    case '图片':
      return Image;
    case 'PDF':
      return FileText;
    case '文档':
      return File;
    default:
      return FileText;
  }
}

export default function Materials() {
  const navigate = useNavigate();
  const { materials, loading } = useMaterials();
  const { publicSettings, refresh: refreshPublicSettings } = useSettings();
  const nav = useNavigationCopy();
  const [searchQuery, setSearchQuery] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const aiChatEnabled =
    publicSettings.features.materialsAiChat && publicSettings.knowledgeAssistant.enabled;
  const answerMode =
    publicSettings.knowledgeAssistant.answerMode === 'flexible'
      ? 'flexible'
      : 'strict';
  const isFlexible = answerMode === 'flexible';
  const chatTitle = '基于知识库提问';
  const activeWelcome = isFlexible
    ? publicSettings.knowledgeAssistant.flexibleWelcomeMessage ||
      publicSettings.knowledgeAssistant.welcomeMessage
    : publicSettings.knowledgeAssistant.welcomeMessage;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const isNearBottom = useCallback((el: HTMLDivElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 64;
  }, []);

  const scrollChatToBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (el) stickToBottomRef.current = isNearBottom(el);
  }, [isNearBottom]);

  useEffect(() => {
    refreshPublicSettings();
  }, [refreshPublicSettings]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshPublicSettings();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshPublicSettings]);

  useEffect(() => {
    stickToBottomRef.current = true;
    setMessages([
      {
        id: 1,
        text: activeWelcome,
        isUser: false,
        timestamp: new Date(),
      },
    ]);
  }, [activeWelcome, answerMode]);

  useLayoutEffect(() => {
    if (!showChat || isChatMinimized || isClosing || !stickToBottomRef.current) return;
    scrollChatToBottom();
  }, [
    messages,
    showChat,
    isChatMinimized,
    isClosing,
    chatLoading,
    scrollChatToBottom,
  ]);

  useEffect(() => {
    if (publicSettings.aiConfigured) {
      setAiReady(true);
      return;
    }
    checkAiServiceAvailable().then(setAiReady);
  }, [publicSettings.aiConfigured]);

  const handleCloseChat = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowChat(false);
      setIsClosing(false);
    }, 150);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredMaterials = materials
    .filter((m) => !m.hidden)
    .filter((material) => {
      if (!normalizedQuery) return true;
      const haystack = [
        material.title,
        material.category,
        material.description,
        material.type,
        ...material.files.map((f) => f.fileName),
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

  const handleOpenMaterial = (material: Material) => {
    if (!materialHasFiles(material)) {
      window.alert('该资料尚未上传文件，请在「培训管理 → 知识库管理」中补充。');
      return;
    }
    const fileId = material.files.length === 1 ? material.files[0].id : undefined;
    navigate(
      fileId
        ? `/materials/${material.id}?file=${fileId}`
        : `/materials/${material.id}`,
    );
  };

  const handleSendMessage = async () => {
    const question = inputMessage.trim();
    if (!question || chatLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      text: question,
      isUser: true,
      timestamp: new Date(),
    };

    const maxTurns = publicSettings.knowledgeAssistant.maxHistoryTurns;
    const historyForApi = [
      ...messages
        .filter((m) => !(m.id === 1 && !m.isUser))
        .filter((m) => !m.text.includes('正在读取知识库') && !m.text.includes('正在根据知识库'))
        .filter((m) => !m.text.startsWith('抱歉，暂时无法回答'))
        .slice(-maxTurns * 2)
        .map((m) => ({
          role: (m.isUser ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text,
        })),
      { role: 'user' as const, content: question },
    ];

    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setChatLoading(true);
    setShowChat(true);

    const thinkingId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      {
        id: thinkingId,
        text: '正在解析知识库全部文件并思考…',
        isUser: false,
        timestamp: new Date(),
      },
    ]);

    try {
      const knowledgeContext = await buildKnowledgeContext(
        null,
        publicSettings.knowledgeAssistant.includeTextFileContent ?? true,
        question,
      );
      const reply = await sendKnowledgeBasedChat(knowledgeContext, historyForApi);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingId
            ? { ...m, text: reply, timestamp: new Date() }
            : m,
        ),
      );
      setAiReady(true);
      await refreshPublicSettings();
    } catch (err) {
      const hint =
        aiReady === false
          ? '请用管理员账号进入「培训管理 → 配置管理」，填写 API Key 并测试连接（会自动保存），或点「保存全部」后再试。'
          : '请确认后端已启动（npm run dev），且 API Key 有效、账户有余额。';

      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingId
            ? {
                ...m,
                text: `抱歉，暂时无法回答：${err instanceof Error ? err.message : '未知错误'}\n\n${hint}`,
                timestamp: new Date(),
              }
            : m,
        ),
      );
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-2xl font-medium mb-1" style={{ color: '#382C25' }}>
          {nav.materials.pageTitle}
        </h1>
        <p className="text-sm" style={{ color: '#7A6E68' }}>
          {nav.materials.pageDescription}
        </p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: '#7A6E68' }}
          />
          <input
            type="search"
            placeholder="搜索资料标题、分类或文件名…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 border rounded-lg outline-none transition-all text-sm"
            style={{
              borderColor: 'rgba(56, 44, 37, 0.15)',
              color: '#382C25',
              backgroundColor: 'white',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#5EC4B6';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.15)';
            }}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-center py-16" style={{ color: '#7A6E68' }}>
          加载资料中…
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map((material) => {
            const Icon = getMaterialIcon(material.type);
            return (
              <button
                key={material.id}
                type="button"
                onClick={() => handleOpenMaterial(material)}
                className="bg-white p-6 rounded-lg border transition-all text-left w-full"
                style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#5EC4B6';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.06)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="p-2.5 rounded-lg"
                    style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: '#5EC4B6' }} />
                  </div>
                  <span
                    className="text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: '#F5F5F5', color: '#7A6E68' }}
                  >
                    {material.type}
                    {material.files.length > 1
                      ? ` · ${material.files.length}个文件`
                      : !materialHasFiles(material)
                        ? ' · 无文件'
                        : ''}
                  </span>
                </div>
                <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
                  {material.title}
                </h3>
                <p className="text-xs mt-3" style={{ color: '#7A6E68' }}>
                  {materialHasFiles(material) ? '点击阅读' : '暂无文件'}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {!loading && filteredMaterials.length === 0 && (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 mx-auto mb-3" style={{ color: '#7A6E68' }} />
          <p className="text-sm" style={{ color: '#7A6E68' }}>未找到相关资料</p>
        </div>
      )}

      <div className="mt-6 relative">
        {!aiChatEnabled && (
          <p
            className="text-sm mb-4 px-4 py-3 rounded-lg"
            style={{ backgroundColor: '#F5F5F5', color: '#7A6E68' }}
          >
            知识库 AI 助手已在配置管理中关闭。管理员可在「培训管理 → 配置管理」中开启。
          </p>
        )}
        {aiChatEnabled && (showChat || isClosing) && (
          <div
            className="absolute left-0 right-0 bg-white border shadow-lg z-50"
            style={{
              bottom: '56px',
              borderColor: 'rgba(56, 44, 37, 0.12)',
              borderBottom: 'none',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
              animation: isClosing
                ? 'slideDown 0.15s linear'
                : 'slideUp 0.15s cubic-bezier(0, 0, 0.2, 1)',
            }}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
            >
              <div className="flex items-center">
                <div
                  className="p-2 rounded-lg mr-3"
                  style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}
                >
                  <MessageCircle className="w-5 h-5" style={{ color: '#5EC4B6' }} />
                </div>
                <div>
                  <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
                    {chatTitle}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: '#7A6E68' }}>
                    {isFlexible
                      ? '以知识库为主，可适度补充说明'
                      : '严格模式：仅根据已上传资料回答'}
                  </p>
                  {aiReady === false && (
                    <p className="text-xs mt-0.5" style={{ color: '#E85D75' }}>
                      AI 未配置：请在「培训管理 → 配置管理」中保存 API Key
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsChatMinimized(!isChatMinimized)}
                  className="p-1.5 rounded transition-all"
                  style={{ color: '#7A6E68' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F5F5F5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <svg
                    className="w-4 h-4 transition-transform"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    style={{ transform: isChatMinimized ? 'rotate(0deg)' : 'rotate(180deg)' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={handleCloseChat}
                  className="p-1.5 rounded transition-all"
                  style={{ color: '#7A6E68' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F5F5F5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {!isChatMinimized && !isClosing && (
              <div
                ref={messagesScrollRef}
                onScroll={handleMessagesScroll}
                className="p-6 space-y-3 overflow-y-auto"
                style={{ height: '400px', animation: 'scaleIn 0.1s linear' }}
              >
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-md px-4 py-2.5 rounded-lg text-sm"
                      style={{
                        backgroundColor: message.isUser ? '#5EC4B6' : '#F5F5F5',
                        color: message.isUser ? 'white' : '#382C25',
                      }}
                    >
                      {message.isUser ? (
                        message.text
                      ) : (
                        <ChatMessageContent text={message.text} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className="bg-white border relative z-50"
          style={{
            borderColor: showChat || isClosing ? 'rgba(56, 44, 37, 0.12)' : 'rgba(56, 44, 37, 0.08)',
            borderTopLeftRadius: showChat || isClosing ? '0' : '12px',
            borderTopRightRadius: showChat || isClosing ? '0' : '12px',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px',
            boxShadow:
              showChat || isClosing
                ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                : '0 10px 36px -8px rgba(56, 44, 37, 0.14), 0 4px 12px -2px rgba(0, 0, 0, 0.06)',
            padding: '18px 24px',
            transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
          }}
        >
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && inputMessage.trim() && !chatLoading) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              onFocus={() => {
                stickToBottomRef.current = true;
                setShowChat(true);
              }}
              disabled={chatLoading || !aiChatEnabled}
              placeholder={
                !aiChatEnabled
                  ? 'AI 助手已关闭'
                  : chatLoading
                    ? '正在回答…'
                    : '基于知识库提问'
              }
              className="flex-1 outline-none bg-transparent transition-all"
              style={{
                color: '#382C25',
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            />

            <button
              type="button"
              disabled={chatLoading || !inputMessage.trim() || !aiChatEnabled}
              onClick={() => handleSendMessage()}
              className="rounded-full flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-60"
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: inputMessage.trim() && !chatLoading ? '#5EC4B6' : '#F0F0F0',
              }}
              onMouseEnter={(e) => {
                if (inputMessage.trim()) {
                  e.currentTarget.style.backgroundColor = '#4DB0A3';
                  e.currentTarget.style.transform = 'scale(1.05)';
                } else {
                  e.currentTarget.style.backgroundColor = '#E5E5E5';
                }
              }}
              onMouseLeave={(e) => {
                if (inputMessage.trim()) {
                  e.currentTarget.style.backgroundColor = '#5EC4B6';
                  e.currentTarget.style.transform = 'scale(1)';
                } else {
                  e.currentTarget.style.backgroundColor = '#F0F0F0';
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              <Send
                className="w-4 h-4"
                style={{ color: inputMessage.trim() ? 'white' : '#B0B0B0' }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
