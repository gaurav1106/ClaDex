import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import './styles.css';

const api = window.openClaude;

const MCP_MARKETPLACE = [
  {
    id: 'filesystem',
    name: 'Local Files',
    description: 'Read selected local folders through the official filesystem MCP server.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    env: {}
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Connect issues, pull requests, repositories, and code search with a GitHub token.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' }
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Register a Google Drive MCP server entry for docs and file search workflows.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    env: {}
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Inspect local SQLite databases through an MCP server.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', 'database.db'],
    env: {}
  }
];

marked.setOptions({
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  }
});

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function truncateText(text, maxLength = 30) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function estimateTokens(messages) {
  return Math.ceil(messages.map((message) => message.content || '').join('\n').length / 4);
}

function normalizeUrl(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^(https?|file):\/\//i.test(text)) return text;
  if (/^[a-z]:\\/i.test(text)) return `file:///${text.replace(/\\/g, '/')}`;
  return text;
}

function artifactType(value) {
  const clean = String(value || '').split('?')[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(clean)) return 'image';
  if (/\.(mp4|webm|mov|m4v|avi)$/.test(clean)) return 'video';
  if (/\.(html?|xhtml)$/.test(clean)) return 'webpage';
  if (/\.(pdf|docx?|pptx?|xlsx?|csv|json|md|txt|zip)$/.test(clean)) return 'file';
  return '';
}

function artifactName(value) {
  const text = String(value || '').replace(/\\/g, '/').split('?')[0];
  return decodeURIComponent(text.split('/').filter(Boolean).at(-1) || text || 'Artifact');
}

function extractArtifactsFromMessages(messages) {
  const seen = new Set();
  const items = [];
  for (const message of messages) {
    const content = String(message.content || '');
    const patterns = [
      /!\[[^\]]*]\(([^)]+)\)/g,
      /\[[^\]]+]\(([^)]+)\)/g,
      /((?:https?|file):\/\/[^\s)]+|[a-z]:\\[^\n\r"'<>]+\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mov|html?|pdf))/gi
    ];
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        const target = (match[1] || '').replace(/^<|>$/g, '');
        const type = artifactType(target);
        if (!type || seen.has(target)) continue;
        seen.add(target);
        items.push({ id: `message-${items.length}-${target}`, name: artifactName(target), path: target, url: normalizeUrl(target), type, source: 'Chat reply' });
      }
    }
  }
  return items;
}

function extractArtifactsFromProjects(projects) {
  const seen = new Set();
  const items = [];
  for (const project of projects) {
    let files = [];
    try {
      files = JSON.parse(project.files_json || '[]');
    } catch {
      files = [];
    }
    for (const file of files) {
      const type = artifactType(file);
      if (!type || seen.has(file)) continue;
      seen.add(file);
      items.push({ id: `project-${project.id}-${file}`, name: artifactName(file), path: file, url: normalizeUrl(file), type, source: project.name || 'Project' });
    }
  }
  return items;
}

function buildDetailedSummary(chat, messages) {
  const turns = messages.filter((message) => message.content?.trim());
  const userMessages = turns.filter((message) => message.role === 'user');
  const assistantMessages = turns.filter((message) => message.role === 'assistant');
  const recent = turns.slice(-8).map((message, index) => `${index + 1}. ${message.role}: ${message.content.trim().slice(0, 900)}`).join('\n\n');
  const keyRequests = userMessages.map((message, index) => `${index + 1}. ${message.content.trim().slice(0, 500)}`).join('\n');

  return `# Detailed Conversation Summary

Source chat: ${chat?.title || 'Untitled chat'}
Messages summarized: ${turns.length}
User messages: ${userMessages.length}
Assistant messages: ${assistantMessages.length}

## User Goals And Requests
${keyRequests || 'No user requests were found.'}

## Current State
The prior conversation has been condensed so this new chat can continue with less context. Use this summary as the working memory for follow-up tasks.

## Recent Conversation Details
${recent || 'No recent messages were found.'}

## Suggested Next Step
Continue from the latest unresolved user request, and ask for clarification only if the summary does not contain enough detail.`;
}

function groupChats(chats) {
  const today = new Date().toDateString();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toDateString();
  return chats.reduce((groups, chat) => {
    const date = new Date(chat.updated_at).toDateString();
    const label = date === today ? 'Today' : date === yesterday ? 'Yesterday' : new Date(chat.updated_at).toLocaleDateString();
    groups[label] ||= [];
    groups[label].push(chat);
    return groups;
  }, {});
}

function App() {
  const [config, setConfig] = useState(null);
  const [configPath, setConfigPath] = useState('');
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState('projects');
  const [rightOpen, setRightOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [activeView, setActiveView] = useState('chat');
  const [activeMode, setActiveMode] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mcpStatuses, setMcpStatuses] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cladex-artifact-bookmarks') || '[]');
    } catch {
      return [];
    }
  });
  const inputRef = useRef(null);
  const messagePane = useRef(null);
  const effectiveModel = activeMode === 'design' ? (config?.designModel || config?.model) : config?.model;
  const runtimeLabel = activeMode === 'design' ? (effectiveModel?.runtimeName || 'OpenDesign') : (effectiveModel?.runtimeName || 'OpenClaude');

  useEffect(() => {
    boot();
    const off = api.onMcpStatus(setMcpStatuses);
    return off;
  }, []);

  useEffect(() => {
    if (!config) return;
    const root = document.documentElement;
    const accent = config.appearance?.accent || '#d97757';
    const rgb = hexToRgb(accent);
    const theme = config.general?.theme || 'system';
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = isDark ? 'dark' : 'light';
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-strong', darken(accent));
    root.style.setProperty('--focus-ring', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
    root.style.fontSize = `${Number(config.appearance?.fontScale || 100)}%`;
  }, [config]);

  useEffect(() => {
    if (messagePane.current && stickToBottom) messagePane.current.scrollTop = messagePane.current.scrollHeight;
  }, [messages, sending, stickToBottom]);

  async function boot() {
    const loaded = await api.loadConfig();
    if (!loaded.config.general.theme || loaded.config.general.theme === 'system') loaded.config.general.theme = 'light';
    setConfig(loaded.config);
    setConfigPath(loaded.configPath);
    const existingChats = await api.listChats();
    setChats(existingChats);
    setProjects(await api.listProjects());
    setMcpStatuses(await api.listMcp());
    if (existingChats[0]) await openChat(existingChats[0].id);
  }

  async function refreshChats() {
    setChats(await api.listChats());
  }

  async function openChat(chatId) {
    const detail = await api.getChat(chatId);
    setActiveChat(detail.chat);
    setMessages(detail.messages || []);
    setActiveView('chat');
  }

  async function newChat() {
    const chat = await api.createChat();
    await refreshChats();
    await openChat(chat.id);
    setInput('');
    setActiveView('chat');
  }

  async function summarizeToNewChat() {
    if (!messages.length) return;
    const summary = buildDetailedSummary(activeChat, messages);
    const chat = await api.createChat(`Summary: ${activeChat?.title || 'Chat'}`);
    await api.addMessage({ chatId: chat.id, role: 'assistant', content: summary });
    await refreshChats();
    await openChat(chat.id);
    setInput('');
    setStickToBottom(true);
  }

  async function ensureChat() {
    if (activeChat) return activeChat;
    const chat = await api.createChat();
    await refreshChats();
    setActiveChat(chat);
    return chat;
  }

  async function requestAssistant(chatId, nextMessages) {
    setSending(true);
    setStickToBottom(true);
    try {
      const effectiveConfig = { ...config, model: effectiveModel, runtimeMode: activeMode };
      const response = await api.sendMessage({ config: effectiveConfig, messages: nextMessages });
      const assistantMessage = await api.addMessage({ chatId, role: 'assistant', content: response || '(empty response)' });
      setMessages([...nextMessages, assistantMessage]);
    } catch (error) {
      const assistantMessage = await api.addMessage({
        chatId,
        role: 'assistant',
        content: `I could not reach the configured model endpoint.\n\n${error.message}`
      });
      setMessages([...nextMessages, assistantMessage]);
    } finally {
      setSending(false);
      await refreshChats();
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    const chat = await ensureChat();
    const userMessage = await api.addMessage({ chatId: chat.id, role: 'user', content });
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setStickToBottom(true);
    await requestAssistant(chat.id, nextMessages);
  }

  async function saveConfig(nextConfig = config) {
    const result = await api.saveConfig(nextConfig);
    setConfig(result.config);
    setConfigPath(result.configPath);
    setDirty(false);
  }

  function updateConfig(path, value) {
    const next = structuredClone(config);
    let cursor = next;
    for (let index = 0; index < path.length - 1; index += 1) cursor = cursor[path[index]];
    cursor[path.at(-1)] = value;
    setConfig(next);
    setDirty(true);
  }

  async function editMessage(message, content) {
    await api.updateMessage({ messageId: message.id, content });
    await api.deleteMessagesAfter({ chatId: message.chat_id, messageId: message.id });
    const detail = await api.getChat(message.chat_id);
    const nextMessages = detail.messages || [];
    setMessages(nextMessages);
    await refreshChats();
    await requestAssistant(message.chat_id, nextMessages);
  }

  async function trimAfter(message) {
    const nextMessages = await api.deleteMessagesAfter({ chatId: message.chat_id, messageId: message.id });
    setMessages(nextMessages || []);
    await refreshChats();
  }

  async function deleteChat(chatId) {
    const nextChats = await api.deleteChat(chatId);
    setChats(nextChats || []);
    if (activeChat?.id === chatId) {
      const nextChat = nextChats?.[0];
      if (nextChat) await openChat(nextChat.id);
      else {
        setActiveChat(null);
        setMessages([]);
      }
    }
  }

  async function deleteProject(projectId) {
    setProjects((await api.deleteProject(projectId)) || []);
  }

  async function toggleChatPin(chatId) {
    setChats((await api.toggleChatPin(chatId)) || []);
  }

  async function toggleProjectPin(projectId) {
    setProjects((await api.toggleProjectPin(projectId)) || []);
  }

  function toggleBookmark(item) {
    const key = item.path || item.url || item.name;
    setBookmarks((current) => {
      const exists = current.some((bookmark) => bookmark.key === key);
      const next = exists
        ? current.filter((bookmark) => bookmark.key !== key)
        : [...current, { key, name: item.name, path: item.path, url: item.url, type: item.type, source: item.source, createdAt: new Date().toISOString() }];
      localStorage.setItem('cladex-artifact-bookmarks', JSON.stringify(next));
      return next;
    });
  }

  if (!config) {
    return <div className="grid h-full place-items-center bg-[#f7f3eb] text-[#241f1a]">Loading ClaDex...</div>;
  }

  return (
    <div className="grid h-full grid-cols-[auto_minmax(0,1fr)] bg-[#f7f3eb] text-[#241f1a] dark:bg-[#171513] dark:text-[#f5eee6]">
      <Sidebar
        chats={chats}
        projects={projects}
        activeChat={activeChat}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onNewChat={newChat}
        onOpenChat={openChat}
        onDeleteChat={deleteChat}
        onDeleteProject={deleteProject}
        onToggleChatPin={toggleChatPin}
        onToggleProjectPin={toggleProjectPin}
        onOpenProjects={() => {
          setActiveView('projects');
          setRightOpen(false);
        }}
        onOpenArtifacts={() => {
          setActiveView('artifacts');
          setRightOpen(false);
        }}
        onOpenBrowser={() => {
          setActiveView('browser');
          setRightOpen(false);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        activeView={activeView}
        activeMode={activeMode}
        setActiveMode={(mode) => {
          setActiveMode(mode);
          setActiveView('chat');
          setRightOpen(false);
        }}
      />
      {activeView === 'projects' ? (
        <ProjectsView
          projects={projects}
          onCreateProject={async (project) => {
            await api.createProject(project);
            setProjects(await api.listProjects());
          }}
          onDeleteProject={deleteProject}
          onToggleProjectPin={toggleProjectPin}
        />
      ) : activeView === 'artifacts' ? (
        <ArtifactsView
          messages={messages}
          projects={projects}
          bookmarks={bookmarks}
          onToggleBookmark={toggleBookmark}
        />
      ) : activeView === 'browser' ? (
        <BrowserLauncher onBackToChat={() => setActiveView('chat')} />
      ) : (
        <main className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] bg-[#1b1b19] text-[#e9e4dc]">
          <section
          ref={messagePane}
          className="themed-scroll min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-8 py-7"
            onScroll={(event) => {
              const node = event.currentTarget;
              setStickToBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 96);
            }}
            onWheel={(event) => event.stopPropagation()}
          >
            {messages.length === 0 ? <Greeting sending={sending} runtimeLabel={runtimeLabel} activeMode={activeMode} /> : <MessageList messages={messages} sending={sending} onEditMessage={editMessage} onTrimAfter={trimAfter} bookmarks={bookmarks} onToggleBookmark={toggleBookmark} />}
          </section>
          <Composer
            input={input}
            setInput={setInput}
            onSubmit={sendMessage}
            sending={sending}
            inputRef={inputRef}
            model={effectiveModel}
            activeMode={activeMode}
            runtimeLabel={runtimeLabel}
            config={config}
            messages={messages}
            onSummarize={summarizeToNewChat}
            canSummarize={messages.length > 0}
          />
        </main>
      )}
      <RightPanel
        open={rightOpen}
        mode={rightPanel}
        setMode={setRightPanel}
        messages={messages}
        projects={projects}
        onClose={() => setRightOpen(false)}
        onCreateProject={async (project) => {
          await api.createProject(project);
          setProjects(await api.listProjects());
        }}
        onDeleteProject={deleteProject}
        onToggleProjectPin={toggleProjectPin}
      />
      {settingsOpen && (
        <Settings
          config={config}
          configPath={configPath}
          dirty={dirty}
          mcpStatuses={mcpStatuses}
          updateConfig={updateConfig}
          saveConfig={saveConfig}
          onClose={() => setSettingsOpen(false)}
          onImport={async () => {
            const result = await api.importConfig();
            if (result) {
              setConfig(result.config);
              setConfigPath(result.configPath);
              setDirty(false);
            }
          }}
          onExport={() => api.exportConfig(config)}
          onChoosePath={async () => {
            const result = await api.chooseConfigPath();
            if (result) {
              setConfig(result.config);
              setConfigPath(result.configPath);
              setDirty(false);
            }
          }}
          onOpenLocation={() => api.openConfigLocation()}
          onStartMcp={api.startMcp}
          onStopMcp={api.stopMcp}
          onInstallMcp={async (server) => {
            const nextConfig = await api.installMcp({ ...server, enabled: true });
            setConfig(nextConfig);
            setDirty(false);
          }}
        />
      )}
    </div>
  );
}

function Sidebar({ chats, projects, activeChat, sidebarOpen, setSidebarOpen, onNewChat, onOpenChat, onDeleteChat, onDeleteProject, onToggleChatPin, onToggleProjectPin, onOpenProjects, onOpenArtifacts, onOpenBrowser, onOpenSettings, activeView, activeMode, setActiveMode }) {
  const pinnedChats = useMemo(() => chats.filter((chat) => Number(chat.pinned) === 1), [chats]);
  const recentChats = useMemo(() => chats.filter((chat) => Number(chat.pinned) !== 1), [chats]);
  const pinnedProjects = useMemo(() => projects.filter((project) => Number(project.pinned) === 1), [projects]);
  const grouped = useMemo(() => groupChats(recentChats), [recentChats]);
  return (
    <aside className={cx('flex h-full flex-col border-r border-[#343432] bg-[#242424] text-[#d6d3cd] transition-all', sidebarOpen ? 'w-[350px]' : 'w-16')}>
      <div className="flex items-center gap-3 p-3">
        <button className="grid h-9 w-9 place-items-center rounded-md text-[#d6d3cd] hover:bg-[#323230]" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">☰</button>
        {sidebarOpen && (
          <div className="grid flex-1 grid-cols-2 rounded-lg bg-[#30302e] p-1 text-sm font-semibold">
            <button onClick={() => setActiveMode('chat')} className={cx('rounded-md py-2', activeMode === 'chat' ? 'bg-[#424240] text-white' : 'text-[#77736d]')}>Chat</button>
            <button onClick={() => setActiveMode('design')} className={cx('rounded-md py-2', activeMode === 'design' ? 'bg-[#424240] text-white' : 'text-[#77736d]')}>Design</button>
          </div>
        )}
      </div>
      <div className="px-3">
        <button onClick={onNewChat} className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left font-semibold hover:bg-[#1b1b19]">+ <span>New chat</span></button>
        {sidebarOpen && <button onClick={onOpenProjects} className={cx('mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left font-semibold', activeView === 'projects' ? 'bg-[#151514] text-white ring-1 ring-[#4d8dff]' : 'hover:bg-[#1b1b19]')}>⌘ <span>Projects</span></button>}
        {sidebarOpen && <button onClick={onOpenArtifacts} className={cx('mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left font-semibold', activeView === 'artifacts' ? 'bg-[#151514] text-white ring-1 ring-[#4d8dff]' : 'hover:bg-[#1b1b19]')}>◫ <span>Artifacts</span></button>}
        {sidebarOpen && <button onClick={onOpenBrowser} className={cx('mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left font-semibold', activeView === 'browser' ? 'bg-[#151514] text-white ring-1 ring-[#4d8dff]' : 'hover:bg-[#1b1b19]')}>↗ <span>Browser</span></button>}
        {sidebarOpen && <button onClick={onOpenSettings} className="mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left font-semibold hover:bg-[#1b1b19]">⚙ <span>Customize</span></button>}
      </div>
      <div className="themed-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
        {sidebarOpen && (pinnedChats.length > 0 || pinnedProjects.length > 0) && (
          <div className="mb-5">
            <div className="mb-2 px-2 text-sm text-[#8d8982]">Pinned</div>
            <div className="grid gap-1">
              {pinnedProjects.map((project) => (
                <SidebarProject key={project.id} project={project} onOpen={onOpenProjects} onDelete={onDeleteProject} onTogglePin={onToggleProjectPin} />
              ))}
              {pinnedChats.map((chat) => (
                <SidebarChat key={chat.id} chat={chat} activeChat={activeChat} onOpenChat={onOpenChat} onDeleteChat={onDeleteChat} onToggleChatPin={onToggleChatPin} />
              ))}
            </div>
          </div>
        )}
        {sidebarOpen && Object.entries(grouped).map(([label, group]) => (
          <div className="mb-4" key={label}>
            <div className="mb-2 px-2 text-sm text-[#8d8982]">{label === 'Today' ? 'Recents' : label}</div>
            <div className="grid gap-1">
              {group.map((chat) => (
                <SidebarChat key={chat.id} chat={chat} activeChat={activeChat} onOpenChat={onOpenChat} onDeleteChat={onDeleteChat} onToggleChatPin={onToggleChatPin} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function SidebarChat({ chat, activeChat, onOpenChat, onDeleteChat, onToggleChatPin }) {
  return (
    <div className="group flex items-center gap-1">
      <button onClick={() => onOpenChat(chat.id)} title={chat.title} className={cx('min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm font-semibold', activeChat?.id === chat.id ? 'bg-[#1b1b19] text-white' : 'hover:bg-[#1b1b19]')}>
        {truncateText(chat.title || 'Untitled chat', 30)}
      </button>
      <button onClick={() => onToggleChatPin(chat.id)} className="rounded px-1.5 py-1 text-xs text-[#8d8982] opacity-0 hover:bg-[#333331] group-hover:opacity-100" title={Number(chat.pinned) === 1 ? 'Unpin chat' : 'Pin chat'}>{Number(chat.pinned) === 1 ? '●' : '○'}</button>
      <button onClick={() => onDeleteChat(chat.id)} className="rounded px-1.5 py-1 text-xs text-[#8d8982] opacity-0 hover:bg-[#333331] group-hover:opacity-100" title="Delete chat">×</button>
    </div>
  );
}

function SidebarProject({ project, onOpen, onDelete, onTogglePin }) {
  return (
    <div className="group flex items-center gap-1">
      <button onClick={onOpen} className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm font-semibold hover:bg-[#1b1b19]">
        {project.name}
      </button>
      <button onClick={() => onTogglePin(project.id)} className="rounded px-1.5 py-1 text-xs text-[#8d8982] opacity-0 hover:bg-[#333331] group-hover:opacity-100" title={Number(project.pinned) === 1 ? 'Unpin project' : 'Pin project'}>{Number(project.pinned) === 1 ? '●' : '○'}</button>
      <button onClick={() => onDelete(project.id)} className="rounded px-1.5 py-1 text-xs text-[#8d8982] opacity-0 hover:bg-[#333331] group-hover:opacity-100" title="Delete project">×</button>
    </div>
  );
}

function Greeting({ sending, runtimeLabel, activeMode }) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="grid justify-items-center gap-5">
        <div className={cx('droplet', sending && 'droplet-thinking')} />
        <div className="grid gap-2">
          <h1 className="font-serif text-5xl font-bold tracking-normal text-[#d6d1c8]">{greeting()}, I am ClaDex</h1>
          <p className="text-sm font-semibold text-[#908b83]">{activeMode === 'design' ? 'Design mode' : 'Chat mode'} · {runtimeLabel}</p>
        </div>
      </div>
    </div>
  );
}

function MessageList({ messages, sending, onEditMessage, onTrimAfter, bookmarks, onToggleBookmark }) {
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      {messages.map((message) => <Message message={message} key={message.id || `${message.role}-${message.created_at}`} onEditMessage={onEditMessage} onTrimAfter={onTrimAfter} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} />)}
      {sending && (
        <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#241f1a] text-xs font-bold text-[#fffaf2] dark:bg-[#f5eee6] dark:text-[#171513]">CD</div>
          <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-[#e6dac9] bg-[#fff9ef] dark:border-[#3b342d] dark:bg-[#201d1a]">
            <div className="droplet droplet-thinking" />
          </div>
        </div>
      )}
    </div>
  );
}

function Message({ message, onEditMessage, onTrimAfter, bookmarks, onToggleBookmark }) {
  const isUser = message.role === 'user';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content || '');
  const [copied, setCopied] = useState(false);
  useEffect(() => setDraft(message.content || ''), [message.content]);

  async function copyReply() {
    await navigator.clipboard.writeText(message.content || '');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  if (editing) {
    return (
      <article className="grid grid-cols-[minmax(0,1fr)_42px] gap-3">
        <div className="order-2 grid h-10 w-10 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>You</div>
        <form className="order-1 grid gap-2" onSubmit={async (event) => {
          event.preventDefault();
          await onEditMessage(message, draft.trim());
          setEditing(false);
        }}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-28 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-3 outline-none focus:ring-4 dark:border-[#3b342d] dark:bg-[#201d1a]" style={{ '--tw-ring-color': 'var(--focus-ring)' }} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[#e6dac9] px-3 py-2 text-sm dark:border-[#3b342d]">Cancel</button>
            <button className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Save edit</button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className={cx('group grid gap-3', isUser ? 'grid-cols-[minmax(0,1fr)_42px]' : 'grid-cols-[42px_minmax(0,1fr)]')}>
      <div className={cx('grid h-10 w-10 place-items-center rounded-lg text-xs font-bold', isUser ? 'order-2 text-white' : 'bg-[#241f1a] text-[#fffaf2] dark:bg-[#f5eee6] dark:text-[#171513]')} style={isUser ? { background: 'var(--accent)' } : null}>{isUser ? 'You' : 'CD'}</div>
      <div className={cx('min-w-0', isUser && 'order-1 justify-self-end')}>
        <div className={cx('markdown rounded-lg border border-[#e6dac9] bg-[#fff9ef] px-4 py-3 dark:border-[#3b342d] dark:bg-[#201d1a]', isUser && 'bg-[#f3e3d4] dark:bg-[#342923]')} dangerouslySetInnerHTML={{ __html: marked.parse(message.content || '') }} />
        {!isUser && <ArtifactPreviewStrip items={extractArtifactsFromMessages([message])} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} />}
        <div className={cx('mt-1 flex gap-2 text-xs text-[#776d63] opacity-0 transition-opacity group-hover:opacity-100 dark:text-[#b6a99c]', isUser && 'justify-end', !isUser && 'opacity-100')}>
          {isUser && <button onClick={() => setEditing(true)} className="rounded px-2 py-1 hover:bg-[#f1e7d8] dark:hover:bg-[#24211d]">Edit</button>}
          {!isUser && <button onClick={copyReply} className="rounded px-2 py-1 hover:bg-[#f1e7d8] dark:hover:bg-[#24211d]">{copied ? 'Copied' : 'Copy'}</button>}
          <button onClick={() => onTrimAfter(message)} className="rounded px-2 py-1 hover:bg-[#f1e7d8] dark:hover:bg-[#24211d]">Trim after</button>
        </div>
      </div>
    </article>
  );
}

function isBookmarked(item, bookmarks = []) {
  const key = item.path || item.url || item.name;
  return bookmarks.some((bookmark) => bookmark.key === key);
}

function ArtifactPreviewStrip({ items, bookmarks, onToggleBookmark }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3 grid gap-2">
      {items.slice(0, 3).map((item) => (
        <ArtifactCard key={item.id} item={item} compact bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} />
      ))}
    </div>
  );
}

function ArtifactCard({ item, compact = false, bookmarks, onToggleBookmark }) {
  const bookmarked = isBookmarked(item, bookmarks);
  return (
    <article className={cx('overflow-hidden rounded-lg border border-[#3a3a38] bg-[#242421]', compact ? 'max-w-xl' : 'min-h-48')}>
      {item.type === 'image' && <img src={item.url} alt={item.name} className={cx('w-full bg-[#171513] object-contain', compact ? 'max-h-52' : 'h-56')} />}
      {item.type === 'video' && <video src={item.url} controls className={cx('w-full bg-black object-contain', compact ? 'max-h-52' : 'h-56')} />}
      {item.type === 'webpage' && (
        <div className="grid h-32 place-items-center bg-[#171513] px-4 text-center text-sm text-[#aaa59c]">
          <span>{item.name}</span>
        </div>
      )}
      {item.type === 'file' && (
        <div className="grid h-32 place-items-center bg-[#171513] px-4 text-center text-sm text-[#aaa59c]">
          <span>{item.name}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[#f2eee7]">{item.name}</div>
          <div className="truncate text-xs text-[#908b83]">{item.source} · {item.type}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={() => onToggleBookmark(item)} className="rounded-md px-2 py-1 text-sm text-[#d6d1c8] hover:bg-[#30302e]" title={bookmarked ? 'Remove bookmark' : 'Bookmark'}>{bookmarked ? '★' : '☆'}</button>
          <button onClick={() => api.openPath(item.path || item.url)} className="rounded-md px-2 py-1 text-sm text-[#d6d1c8] hover:bg-[#30302e]" title="Open">↗</button>
        </div>
      </div>
    </article>
  );
}

function BrowserLauncher({ onBackToChat }) {
  const [url, setUrl] = useState('https://www.google.com');
  return (
    <main className="grid min-h-0 min-w-0 place-items-center bg-[#1b1b19] px-8 py-8 text-[#e9e4dc]">
      <section className="grid w-full max-w-2xl gap-5 rounded-xl border border-[#3a3a38] bg-[#242421] p-6">
        <div>
          <h1 className="text-2xl font-bold">Browser PiP</h1>
          <p className="mt-1 text-sm text-[#908b83]">Opens a floating browser capped at 800x600 with Back and Close controls.</p>
        </div>
        <div className="flex gap-2">
          <input value={url} onChange={(event) => setUrl(event.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border border-[#42423f] bg-[#1b1b19] px-3 outline-none" />
          <button onClick={() => api.openBrowserPip(url)} className="rounded-lg bg-[#f2eee7] px-4 font-semibold text-[#242424]">Open</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => api.backBrowserPip()} className="rounded-lg border border-[#42423f] px-4 py-2">Back</button>
          <button onClick={() => api.closeBrowserPip()} className="rounded-lg border border-[#42423f] px-4 py-2">Close PiP</button>
          <button onClick={onBackToChat} className="ml-auto rounded-lg px-4 py-2 font-semibold text-white" style={{ background: 'var(--accent)' }}>Back to chat</button>
        </div>
      </section>
    </main>
  );
}

function Composer({ input, setInput, onSubmit, sending, inputRef, model, messages, onSummarize, canSummarize, activeMode, runtimeLabel, config }) {
  const tokenCount = estimateTokens(messages);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = '0px';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
  }, [input, inputRef]);

  return (
    <div className="px-8 pb-8">
      <form onSubmit={onSubmit} className="relative mx-auto grid max-w-4xl grid-cols-[auto_minmax(0,1fr)_auto_auto] items-end gap-2 rounded-3xl border border-[#3a3a38] bg-[#2b2b29] p-4 shadow-soft">
        <button type="button" onClick={() => setMenuOpen(!menuOpen)} className="h-11 w-11 rounded-full text-2xl text-[#d6d1c8] hover:bg-[#383836]" title="Add context">+</button>
        {menuOpen && <ComposerPlusMenu config={config} setInput={setInput} onClose={() => setMenuOpen(false)} />}
        <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder={activeMode === 'design' ? 'Describe the interface, page, asset, or design system you want...' : 'How can I help you today?'} disabled={sending} rows={1} className="max-h-44 min-h-11 resize-none bg-transparent px-3 py-2 text-lg text-[#e9e4dc] outline-none placeholder:text-[#918d85]" onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) onSubmit(event);
        }} />
        <button type="button" disabled={!canSummarize || sending} onClick={onSummarize} className="h-11 rounded-lg border border-[#464642] px-3 text-sm text-[#d6d1c8] disabled:opacity-50">Summary</button>
        <button disabled={sending || !input.trim()} className="h-11 rounded-full px-4 font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>{sending ? '...' : 'Send'}</button>
      </form>
      <div className="mt-3 flex justify-center gap-4 text-[12px] text-[#908b83]">
        <span>{runtimeLabel}</span>
        <span>{model.provider || 'provider'}</span>
        <span>{model.defaultModel || 'model'}</span>
        <span>{Number(model.maxTokens || 0).toLocaleString()} context</span>
        <span>{tokenCount.toLocaleString()} tokens</span>
      </div>
    </div>
  );
}

function ComposerPlusMenu({ config, setInput, onClose }) {
  function insertText(text) {
    setInput((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${text} `);
    onClose();
  }

  async function insertFiles(kind) {
    const files = await api.chooseProjectFiles();
    if (!files?.length) return;
    insertText(files.map((file) => `[${kind}: ${file}]`).join(' '));
  }

  return (
    <div className="absolute bottom-[76px] left-4 z-20 w-80 rounded-2xl border border-[#3d3d3a] bg-[#20201e] p-2 text-left shadow-soft">
      <div className="px-3 py-2 text-xs font-semibold uppercase text-[#908b83]">Add to conversation</div>
      <button type="button" onClick={() => insertFiles('file')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#30302e]">Attach files</button>
      <button type="button" onClick={() => insertFiles('image')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#30302e]">Attach images</button>
      <div className="my-2 h-px bg-[#333331]" />
      <div className="px-3 py-1 text-xs font-semibold uppercase text-[#908b83]">Skills</div>
      {(config.skills || []).filter((skill) => skill.enabled !== false).slice(0, 6).map((skill) => (
        <button key={skill.id} type="button" onClick={() => insertText(`${skill.slash || `/${skill.name.toLowerCase()}`} `)} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#30302e]">
          <span className="font-semibold">{skill.slash}</span> <span className="text-[#aaa59c]">{skill.name}</span>
        </button>
      ))}
      <div className="my-2 h-px bg-[#333331]" />
      <div className="px-3 py-1 text-xs font-semibold uppercase text-[#908b83]">MCP</div>
      {(config.mcpServers || []).slice(0, 4).map((server) => (
        <button key={server.id} type="button" onClick={() => insertText(`/mcp ${server.name}`)} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#30302e]">{server.name}</button>
      ))}
    </div>
  );
}

function ArtifactsView({ messages, projects, bookmarks, onToggleBookmark }) {
  const artifacts = useMemo(() => {
    const combined = [...extractArtifactsFromMessages(messages), ...extractArtifactsFromProjects(projects)];
    const seen = new Set();
    return combined.filter((item) => {
      const key = item.path || item.url || item.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages, projects]);
  const bookmarkedArtifacts = bookmarks.map((bookmark) => ({ ...bookmark, id: `bookmark-${bookmark.key}`, source: bookmark.source || 'Bookmark' }));
  const visible = [...bookmarkedArtifacts, ...artifacts.filter((item) => !isBookmarked(item, bookmarks))];

  return (
    <main className="themed-scroll min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-[#1b1b19] px-10 py-12 text-[#e9e4dc]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-bold tracking-normal text-[#f2eee7]">Artifacts</h1>
            <p className="mt-2 text-sm text-[#908b83]">Images, videos, webpages, and files referenced in chat or attached to projects.</p>
          </div>
          <div className="text-sm text-[#908b83]">{bookmarks.length} bookmarked</div>
        </div>
        {visible.length ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => <ArtifactCard key={item.id} item={item} bookmarks={bookmarks} onToggleBookmark={onToggleBookmark} />)}
          </div>
        ) : (
          <div className="rounded-xl border border-[#3a3a38] bg-[#242421] p-8 text-[#aaa59c]">No artifacts yet. Generated image, video, webpage, and file links will appear here.</div>
        )}
      </div>
    </main>
  );
}

function ProjectsView({ projects, onCreateProject, onDeleteProject, onToggleProjectPin }) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const visibleProjects = projects.filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="themed-scroll min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-[#1b1b19] px-10 py-12 text-[#e9e4dc]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="font-serif text-4xl font-bold tracking-normal text-[#f2eee7]">Projects</h1>
          <div className="flex items-center gap-3">
            <button className="h-10 w-10 rounded-full text-[#b8b3aa] hover:bg-[#282826]" title="Sort pinned first">↕</button>
            <label className="flex h-10 items-center gap-2 rounded-full bg-transparent px-2 text-[#b8b3aa]">
              <span>⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-40 bg-transparent outline-none placeholder:text-[#77736d]" placeholder="Search" />
            </label>
            <button onClick={() => setCreating(true)} className="h-10 rounded-lg bg-[#f2eee7] px-4 font-semibold text-[#242424]">New project</button>
          </div>
        </div>

        {creating && (
          <ProjectForm
            onCancel={() => setCreating(false)}
            onCreateProject={async (project) => {
              await onCreateProject(project);
              setCreating(false);
            }}
          />
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.map((project) => (
            <ProjectCard key={project.id} project={project} onDeleteProject={onDeleteProject} onToggleProjectPin={onToggleProjectPin} />
          ))}
          {visibleProjects.length === 0 && <p className="text-[#908b83]">No projects found.</p>}
        </div>
      </div>
    </main>
  );
}

function ProjectForm({ onCreateProject, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [files, setFiles] = useState([]);

  return (
    <form className="mb-7 grid gap-3 rounded-lg border border-[#3a3a38] bg-[#242421] p-4" onSubmit={async (event) => {
      event.preventDefault();
      if (!name.trim()) return;
      await onCreateProject({ name, description, folderPath, files });
      setName('');
      setDescription('');
      setFolderPath('');
      setFiles([]);
    }}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" className="h-11 rounded-lg border border-[#42423f] bg-[#1f1f1d] px-3 outline-none focus:ring-4" style={{ '--tw-ring-color': 'var(--focus-ring)' }} />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="min-h-20 rounded-lg border border-[#42423f] bg-[#1f1f1d] p-3 outline-none focus:ring-4" style={{ '--tw-ring-color': 'var(--focus-ring)' }} />
      <div className="flex flex-wrap items-center gap-2 text-sm text-[#aaa59c]">
        <button type="button" onClick={async () => setFolderPath(await api.chooseProjectFolder())} className="rounded-md border border-[#42423f] px-3 py-2">Choose folder</button>
        <button type="button" onClick={async () => setFiles(await api.chooseProjectFiles())} className="rounded-md border border-[#42423f] px-3 py-2">Add files</button>
        <span className="min-w-0 truncate">{folderPath || (files.length ? `${files.length} file(s) attached` : 'No folder selected')}</span>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[#42423f] px-4 py-2">Cancel</button>
        <button className="rounded-lg bg-[#f2eee7] px-4 py-2 font-semibold text-[#242424]">Create project</button>
      </div>
    </form>
  );
}

function ProjectCard({ project, onDeleteProject, onToggleProjectPin }) {
  const files = JSON.parse(project.files_json || '[]');
  const relativeDate = new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <article className="group grid min-h-40 gap-3 rounded-xl border border-[#3a3a38] bg-gradient-to-b from-[#20201e] to-[#1b1b19] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-[#f2eee7]">{project.name}</h2>
          {project.description && <p className="mt-3 line-clamp-2 text-[#aaa59c]">{project.description}</p>}
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => onToggleProjectPin(project.id)} className="h-8 w-8 rounded-md text-[#aaa59c] hover:bg-[#30302e]" title={Number(project.pinned) === 1 ? 'Unpin project' : 'Pin project'}>{Number(project.pinned) === 1 ? '●' : '○'}</button>
          <button onClick={() => onDeleteProject(project.id)} className="h-8 w-8 rounded-md text-[#aaa59c] hover:bg-[#30302e]" title="Delete project">×</button>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 text-sm text-[#aaa59c]">
        <span>{relativeDate}</span>
        {project.folder_path && <button onClick={() => api.openPath(project.folder_path)} className="max-w-36 truncate hover:text-[#f2eee7]">Open folder</button>}
        {files.length > 0 && <span>{files.length} file(s)</span>}
      </div>
    </article>
  );
}

function RightPanel({ open, mode, setMode, messages, projects, onClose, onCreateProject, onDeleteProject, onToggleProjectPin }) {
  return (
    <aside className={cx('themed-scroll fixed right-0 top-0 z-20 h-full w-96 overflow-y-auto overflow-x-hidden border-l border-[#e6dac9] bg-[#fffcf7] p-4 shadow-soft transition-transform dark:border-[#3b342d] dark:bg-[#201d1a]', open ? 'translate-x-0' : 'translate-x-full')}>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 rounded-lg bg-[#f1e7d8] p-1 dark:bg-[#24211d]">
          {['projects'].map((item) => <button key={item} onClick={() => setMode(item)} className={cx('flex-1 rounded-md py-2 text-sm capitalize', mode === item && 'bg-[#fffcf7] font-semibold dark:bg-[#171513]')}>{item}</button>)}
        </div>
        <button onClick={onClose} className="h-10 w-10 rounded-lg border border-[#e6dac9] text-sm font-semibold dark:border-[#3b342d]" title="Close panel">×</button>
      </div>
      <Projects projects={projects} onCreateProject={onCreateProject} onDeleteProject={onDeleteProject} onToggleProjectPin={onToggleProjectPin} />
    </aside>
  );
}

function Projects({ projects, onCreateProject, onDeleteProject, onToggleProjectPin }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [files, setFiles] = useState([]);

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="font-bold">Projects</h2>
        <p className="text-sm text-[#776d63] dark:text-[#b6a99c]">Create lightweight project spaces for future knowledge bases and folders.</p>
      </div>
      <form className="grid gap-2 rounded-lg border border-[#e6dac9] bg-[#fff9ef] p-3 dark:border-[#3b342d] dark:bg-[#24211d]" onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        await onCreateProject({ name, description, folderPath, files });
        setName('');
        setDescription('');
        setFolderPath('');
        setFiles([]);
      }}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" className="h-10 rounded-lg border border-[#e6dac9] bg-[#fffaf3] px-3 outline-none dark:border-[#3b342d] dark:bg-[#201d1a]" />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="min-h-20 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-3 outline-none dark:border-[#3b342d] dark:bg-[#201d1a]" />
        <div className="grid gap-2 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-2 text-xs dark:border-[#3b342d] dark:bg-[#201d1a]">
          <div className="break-all text-[#776d63] dark:text-[#b6a99c]">{folderPath || 'No folder selected'}</div>
          <div className="flex gap-2">
            <button type="button" onClick={async () => setFolderPath(await api.chooseProjectFolder())} className="rounded border border-[#e6dac9] px-2 py-1 dark:border-[#3b342d]">Choose folder</button>
            <button type="button" onClick={async () => setFiles(await api.chooseProjectFiles())} className="rounded border border-[#e6dac9] px-2 py-1 dark:border-[#3b342d]">Add files</button>
          </div>
          {files.length > 0 && <div className="text-[#776d63] dark:text-[#b6a99c]">{files.length} file(s) attached</div>}
        </div>
        <button className="h-10 rounded-lg px-3 text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Create project</button>
      </form>
      <div className="grid gap-2">
        {projects.length === 0 && <p className="text-sm text-[#776d63] dark:text-[#b6a99c]">No projects yet.</p>}
        {projects.map((project) => (
          <article key={project.id} className="rounded-lg border border-[#e6dac9] bg-[#fff9ef] p-3 dark:border-[#3b342d] dark:bg-[#24211d]">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{project.name}</div>
              <div className="flex gap-1">
                <button onClick={() => onToggleProjectPin(project.id)} className="rounded px-2 py-1 text-xs text-[#776d63] hover:bg-[#f1e7d8] dark:text-[#b6a99c] dark:hover:bg-[#201d1a]">{Number(project.pinned) === 1 ? 'Unpin' : 'Pin'}</button>
                <button onClick={() => onDeleteProject(project.id)} className="rounded px-2 py-1 text-xs text-[#776d63] hover:bg-[#f1e7d8] dark:text-[#b6a99c] dark:hover:bg-[#201d1a]">Delete</button>
              </div>
            </div>
            {project.description && <p className="mt-1 text-sm text-[#776d63] dark:text-[#b6a99c]">{project.description}</p>}
            {project.folder_path && (
              <button onClick={() => api.openPath(project.folder_path)} className="mt-2 block max-w-full truncate rounded border border-[#e6dac9] px-2 py-1 text-left text-xs text-[#776d63] dark:border-[#3b342d] dark:text-[#b6a99c]">
                Open folder: {project.folder_path}
              </button>
            )}
            {JSON.parse(project.files_json || '[]').length > 0 && (
              <div className="mt-2 text-xs text-[#776d63] dark:text-[#b6a99c]">{JSON.parse(project.files_json || '[]').length} file(s)</div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function Settings(props) {
  const { config, configPath, dirty, mcpStatuses, updateConfig, saveConfig, onClose, onImport, onExport, onChoosePath, onOpenLocation, onStartMcp, onStopMcp, onInstallMcp } = props;
  const [tab, setTab] = useState('model');
  const tabs = ['model', 'mcp', 'skills', 'features', 'appearance', 'config'];
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-6">
      <section className="grid h-[86vh] w-full max-w-6xl grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-lg border border-[#e6dac9] bg-[#fffcf7] shadow-soft dark:border-[#3b342d] dark:bg-[#24211d]">
        <aside className="border-r border-[#e6dac9] bg-[#f1e7d8] p-3 dark:border-[#3b342d] dark:bg-[#201d1a]">
          <div className="mb-4 px-2 text-lg font-bold">Settings</div>
          <div className="grid gap-1">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={cx('rounded-lg px-3 py-2 text-left text-sm capitalize', tab === item && 'bg-[#fffcf7] font-semibold dark:bg-[#24211d]')}>{item}</button>)}</div>
        </aside>
        <main className="themed-scroll min-w-0 overflow-y-auto overflow-x-hidden p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><h1 className="text-2xl font-bold capitalize">{tab}</h1><p className="text-sm text-[#776d63] dark:text-[#b6a99c]">{dirty ? 'Unsaved changes' : 'Saved'}</p></div>
            <div className="flex gap-2"><button onClick={onClose} className="rounded-lg border border-[#e6dac9] px-4 py-2 dark:border-[#3b342d]">Close</button><button onClick={() => saveConfig()} className="rounded-lg px-4 py-2 font-semibold text-white" style={{ background: 'var(--accent)' }}>Save</button></div>
          </div>
          {tab === 'model' && <ModelSettings config={config} updateConfig={updateConfig} />}
          {tab === 'mcp' && <McpSettings config={config} updateConfig={updateConfig} statuses={mcpStatuses} onStart={onStartMcp} onStop={onStopMcp} onInstall={onInstallMcp} />}
          {tab === 'skills' && <SkillSettings config={config} updateConfig={updateConfig} />}
          {tab === 'features' && <FeatureSettings config={config} updateConfig={updateConfig} />}
          {tab === 'appearance' && <AppearanceSettings config={config} updateConfig={updateConfig} />}
          {tab === 'config' && <ConfigSettings configPath={configPath} onImport={onImport} onExport={onExport} onChoosePath={onChoosePath} onOpenLocation={onOpenLocation} />}
        </main>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return <label className="grid gap-2 text-sm font-semibold text-[#776d63] dark:text-[#b6a99c]"><span>{label}</span><input type={type} value={value ?? ''} onChange={(event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value)} className="h-11 rounded-lg border border-[#e6dac9] bg-[#fffaf3] px-3 text-[#241f1a] outline-none focus:ring-4 dark:border-[#3b342d] dark:bg-[#201d1a] dark:text-[#f5eee6]" style={{ '--tw-ring-color': 'var(--focus-ring)' }} /></label>;
}

function ModelSettings({ config, updateConfig }) {
  const chatModel = config.model;
  const designModel = config.designModel || config.model;
  return (
    <div className="grid gap-6">
      <ModelProfileSettings title="Chat model - OpenClaude" pathName="model" model={chatModel} updateConfig={updateConfig} />
      <ModelProfileSettings title="Design model - OpenDesign" pathName="designModel" model={designModel} updateConfig={updateConfig} />
    </div>
  );
}

function ModelProfileSettings({ title, pathName, model, updateConfig }) {
  return (
    <section className="rounded-lg border border-[#e6dac9] p-4 dark:border-[#3b342d]">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Runtime name" value={model.runtimeName} onChange={(value) => updateConfig([pathName, 'runtimeName'], value)} />
        <Field label="Provider" value={model.provider} onChange={(value) => updateConfig([pathName, 'provider'], value)} />
        <Field label="Default model" value={model.defaultModel} onChange={(value) => updateConfig([pathName, 'defaultModel'], value)} />
        <Field label="API base URL" value={model.apiBaseUrl} onChange={(value) => updateConfig([pathName, 'apiBaseUrl'], value)} />
        <Field label={model.hasSecureApiKey ? 'API key stored securely' : 'API key'} value={model.apiKey || ''} type="password" onChange={(value) => updateConfig([pathName, 'apiKey'], value)} />
        <Field label="API key env var" value={model.apiKeyEnv || ''} onChange={(value) => updateConfig([pathName, 'apiKeyEnv'], value)} />
        <Field label="Max context" value={model.maxTokens} type="number" onChange={(value) => updateConfig([pathName, 'maxTokens'], value)} />
        <Field label="Temperature" value={model.temperature} type="number" onChange={(value) => updateConfig([pathName, 'temperature'], value)} />
        {pathName === 'designModel' && <Field label="OpenDesign GitHub" value={model.githubRepo || ''} onChange={(value) => updateConfig([pathName, 'githubRepo'], value)} />}
        <label className="flex items-center gap-3 pt-7"><input type="checkbox" checked={model.streaming} onChange={(event) => updateConfig([pathName, 'streaming'], event.target.checked)} /> Streaming responses</label>
      </div>
    </section>
  );
}

function McpSettings({ config, updateConfig, statuses, onStart, onStop, onInstall }) {
  const [custom, setCustom] = useState({ name: '', command: '', args: '', env: '{}' });
  const installedIds = new Set(config.mcpServers.map((server) => server.id));

  function addCustomConnector() {
    if (!custom.name.trim() || !custom.command.trim()) return;
    const next = structuredClone(config.mcpServers);
    let env = {};
    try {
      env = JSON.parse(custom.env || '{}');
    } catch {
      env = {};
    }
    next.push({
      id: `custom-${Date.now()}`,
      name: custom.name.trim(),
      enabled: true,
      command: custom.command.trim(),
      args: custom.args.split('\n').map((line) => line.trim()).filter(Boolean),
      env
    });
    updateConfig(['mcpServers'], next);
    setCustom({ name: '', command: '', args: '', env: '{}' });
  }

  return (
    <div className="grid gap-6">
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">MCP Marketplace</h2>
            <p className="text-sm text-[#776d63] dark:text-[#b6a99c]">Install presets with one click. They use `npx -y`, so dependencies are pulled automatically when the server starts.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {MCP_MARKETPLACE.map((item) => (
            <article key={item.id} className="rounded-lg border border-[#e6dac9] bg-[#fff9ef] p-4 dark:border-[#3b342d] dark:bg-[#201d1a]">
              <div className="mb-1 font-semibold">{item.name}</div>
              <p className="mb-3 text-sm text-[#776d63] dark:text-[#b6a99c]">{item.description}</p>
              <button
                disabled={installedIds.has(item.id)}
                onClick={() => onInstall({ ...item, enabled: true })}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {installedIds.has(item.id) ? 'Installed' : 'Install'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-4 dark:border-[#3b342d] dark:bg-[#201d1a]">
        <h2 className="mb-3 text-lg font-bold">Custom Connector</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" value={custom.name} onChange={(value) => setCustom({ ...custom, name: value })} />
          <Field label="Command" value={custom.command} onChange={(value) => setCustom({ ...custom, command: value })} />
          <label className="grid gap-2 text-sm font-semibold text-[#776d63] dark:text-[#b6a99c]"><span>Args, one per line</span><textarea value={custom.args} onChange={(event) => setCustom({ ...custom, args: event.target.value })} className="min-h-24 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-3 text-[#241f1a] dark:border-[#3b342d] dark:bg-[#201d1a] dark:text-[#f5eee6]" /></label>
          <label className="grid gap-2 text-sm font-semibold text-[#776d63] dark:text-[#b6a99c]"><span>Environment JSON</span><textarea value={custom.env} onChange={(event) => setCustom({ ...custom, env: event.target.value })} className="min-h-24 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-3 text-[#241f1a] dark:border-[#3b342d] dark:bg-[#201d1a] dark:text-[#f5eee6]" /></label>
        </div>
        <button onClick={addCustomConnector} className="mt-3 rounded-lg border border-[#e6dac9] px-3 py-2 text-sm font-semibold dark:border-[#3b342d]">Add connector</button>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Installed Servers</h2>
        <div className="grid gap-3">{config.mcpServers.map((server, index) => {
          const status = statuses.find((item) => item.id === server.id);
          return (
            <div key={server.id} className="rounded-lg border border-[#e6dac9] p-4 dark:border-[#3b342d]">
              <div className="mb-3 flex items-center justify-between"><strong>{server.name}</strong><span className={cx('rounded-full px-2 py-1 text-xs', status?.status === 'Running' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{status?.status || 'Stopped'}</span></div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" value={server.name} onChange={(value) => updateConfig(['mcpServers', index, 'name'], value)} />
                <Field label="Command" value={server.command} onChange={(value) => updateConfig(['mcpServers', index, 'command'], value)} />
              </div>
              <div className="mt-3 flex gap-2"><button onClick={() => onStart(server)} className="rounded-lg border px-3 py-2">Start</button><button onClick={() => onStop(server.id)} className="rounded-lg border px-3 py-2">Stop</button></div>
            </div>
          );
        })}</div>
      </section>
    </div>
  );
}

function ListSettings({ title, items, pathName, updateConfig }) {
  return <div className="grid gap-3">{items.map((item, index) => <div key={item.id} className="rounded-lg border border-[#e6dac9] p-4 dark:border-[#3b342d]"><div className="grid grid-cols-2 gap-3"><Field label={`${title.slice(0, -1)} name`} value={item.name} onChange={(value) => updateConfig([pathName, index, 'name'], value)} /><Field label="Path" value={item.path || ''} onChange={(value) => updateConfig([pathName, index, 'path'], value)} /></div></div>)}</div>;
}

function SkillSettings({ config, updateConfig }) {
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    instructions: '',
    knowledgeBase: '',
    slash: '/',
    autoInvoke: true,
    sourceRepo: 'local'
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [openSkills, setOpenSkills] = useState({});
  const [githubUrl, setGithubUrl] = useState('');
  const [importingGithub, setImportingGithub] = useState(false);
  const [githubImportMessage, setGithubImportMessage] = useState('');

  function setSkills(nextSkills) {
    updateConfig(['skills'], nextSkills);
  }

  function addSkill() {
    if (!draft.name.trim()) return;
    const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';
    setSkills([
      ...(config.skills || []),
      {
        id: `custom-${Date.now()}`,
        enabled: true,
        path: '',
        ...draft,
        name: draft.name.trim(),
        slash: draft.slash && draft.slash !== '/' ? draft.slash : `/${slug}`
      }
    ]);
    setDraft({ name: '', description: '', instructions: '', knowledgeBase: '', slash: '/', autoInvoke: true, sourceRepo: 'local' });
  }

  async function importFromGithub() {
    const url = githubUrl.trim();
    if (!url || importingGithub) return;
    setImportingGithub(true);
    setGithubImportMessage('');
    try {
      const importedSkills = await api.importGithubSkill(url);
      const current = config.skills || [];
      const existingIds = new Set(current.map((skill) => skill.id));
      const existingCalls = new Set(current.map((skill) => `${skill.sourceRepo}:${skill.slash}`));
      const additions = importedSkills
        .map((skill, index) => ({
          id: skill.id || `github-${Date.now()}-${index}`,
          ...skill,
          slash: skill.slash?.startsWith('/') ? skill.slash : `/${skill.slash || 'skill'}`
        }))
        .filter((skill) => !existingIds.has(skill.id) && !existingCalls.has(`${skill.sourceRepo}:${skill.slash}`));
      if (!additions.length) {
        setGithubImportMessage('Those GitHub skills are already in your list.');
        return;
      }
      setSkills([...current, ...additions]);
      setOpenSkills((open) => additions.reduce((next, skill) => ({ ...next, [skill.id]: true }), open));
      setGithubUrl('');
      setGithubImportMessage(`Imported ${additions.length} skill${additions.length === 1 ? '' : 's'}. Save settings to keep them.`);
    } catch (error) {
      setGithubImportMessage(error.message || 'Could not import that GitHub skill.');
    } finally {
      setImportingGithub(false);
    }
  }

  function updateSkill(index, key, value) {
    const next = structuredClone(config.skills || []);
    next[index] = { ...next[index], [key]: value };
    setSkills(next);
  }

  function removeSkill(index) {
    const next = structuredClone(config.skills || []);
    next.splice(index, 1);
    setSkills(next);
  }

  function toggleSkill(skillId) {
    setOpenSkills((current) => ({ ...current, [skillId]: !current[skillId] }));
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-4 dark:border-[#3b342d] dark:bg-[#201d1a]">
        <div className="mb-3">
          <h2 className="text-lg font-bold">Import from GitHub</h2>
          <p className="text-sm text-[#776d63] dark:text-[#b6a99c]">Paste a repo URL. ClaDex reads SKILL.md first, then README.md or another Markdown instruction file.</p>
        </div>
        <div className="flex gap-2">
          <input
            value={githubUrl}
            onChange={(event) => setGithubUrl(event.target.value)}
            placeholder="https://github.com/owner/repo"
            className="h-11 min-w-0 flex-1 rounded-lg border border-[#e6dac9] bg-[#fffaf3] px-3 text-[#241f1a] outline-none focus:ring-4 dark:border-[#3b342d] dark:bg-[#201d1a] dark:text-[#f5eee6]"
            style={{ '--tw-ring-color': 'var(--focus-ring)' }}
          />
          <button type="button" disabled={!githubUrl.trim() || importingGithub} onClick={importFromGithub} className="rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
            {importingGithub ? 'Importing...' : 'Import'}
          </button>
        </div>
        {githubImportMessage && <p className="mt-2 text-sm text-[#776d63] dark:text-[#b6a99c]">{githubImportMessage}</p>}
      </section>

      <section className="rounded-lg border border-[#e6dac9] dark:border-[#3b342d]">
        <button type="button" onClick={() => setCreateOpen(!createOpen)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
          <span className="text-lg font-bold">Create new skill</span>
          <span className="text-xl text-[#776d63] dark:text-[#b6a99c]">{createOpen ? '⌃' : '⌄'}</span>
        </button>
        {createOpen && (
          <div className="border-t border-[#e6dac9] p-4 dark:border-[#3b342d]">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
              <Field label="Slash call" value={draft.slash} onChange={(value) => setDraft({ ...draft, slash: value.startsWith('/') ? value : `/${value}` })} />
              <Field label="Description" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} />
              <Field label="Source repo" value={draft.sourceRepo} onChange={(value) => setDraft({ ...draft, sourceRepo: value })} />
              <label className="grid gap-2 text-sm font-semibold text-[#776d63] dark:text-[#b6a99c]"><span>Instruction set</span><textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} className="min-h-28 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-3 text-[#241f1a] dark:border-[#3b342d] dark:bg-[#201d1a] dark:text-[#f5eee6]" /></label>
              <label className="grid gap-2 text-sm font-semibold text-[#776d63] dark:text-[#b6a99c]"><span>Knowledge base</span><textarea value={draft.knowledgeBase} onChange={(event) => setDraft({ ...draft, knowledgeBase: event.target.value })} className="min-h-28 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-3 text-[#241f1a] dark:border-[#3b342d] dark:bg-[#201d1a] dark:text-[#f5eee6]" /></label>
              <label className="flex items-center gap-3"><input type="checkbox" checked={draft.autoInvoke} onChange={(event) => setDraft({ ...draft, autoInvoke: event.target.checked })} /> Auto-call when task matches</label>
            </div>
            <button onClick={addSkill} className="mt-4 rounded-lg px-4 py-2 font-semibold text-white" style={{ background: 'var(--accent)' }}>Create skill</button>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        {(config.skills || []).map((skill, index) => (
          <article key={skill.id} className="rounded-lg border border-[#e6dac9] dark:border-[#3b342d]">
            <div className="flex items-center justify-between gap-3 p-4">
              <button type="button" onClick={() => toggleSkill(skill.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="text-xl text-[#776d63] dark:text-[#b6a99c]">{openSkills[skill.id] ? '⌃' : '⌄'}</span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{skill.name}</span>
                  <span className="block truncate text-xs text-[#776d63] dark:text-[#b6a99c]">{skill.sourceRepo || 'local'} · {skill.slash || '/'}</span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <label className="text-sm"><input type="checkbox" checked={skill.enabled !== false} onChange={(event) => updateSkill(index, 'enabled', event.target.checked)} /> Enabled</label>
                <button onClick={() => removeSkill(index)} className="rounded border border-[#e6dac9] px-2 py-1 text-xs dark:border-[#3b342d]">Remove</button>
              </div>
            </div>
            {openSkills[skill.id] && (
              <div className="grid grid-cols-2 gap-3 border-t border-[#e6dac9] p-4 dark:border-[#3b342d]">
                <Field label="Name" value={skill.name} onChange={(value) => updateSkill(index, 'name', value)} />
                <Field label="Slash call" value={skill.slash || '/'} onChange={(value) => updateSkill(index, 'slash', value.startsWith('/') ? value : `/${value}`)} />
                <Field label="Description" value={skill.description || ''} onChange={(value) => updateSkill(index, 'description', value)} />
                <Field label="Source repo" value={skill.sourceRepo || ''} onChange={(value) => updateSkill(index, 'sourceRepo', value)} />
                <label className="grid gap-2 text-sm font-semibold text-[#776d63] dark:text-[#b6a99c]"><span>Instruction set</span><textarea value={skill.instructions || ''} onChange={(event) => updateSkill(index, 'instructions', event.target.value)} className="min-h-24 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-3 text-[#241f1a] dark:border-[#3b342d] dark:bg-[#201d1a] dark:text-[#f5eee6]" /></label>
                <label className="grid gap-2 text-sm font-semibold text-[#776d63] dark:text-[#b6a99c]"><span>Knowledge base</span><textarea value={skill.knowledgeBase || ''} onChange={(event) => updateSkill(index, 'knowledgeBase', event.target.value)} className="min-h-24 rounded-lg border border-[#e6dac9] bg-[#fffaf3] p-3 text-[#241f1a] dark:border-[#3b342d] dark:bg-[#201d1a] dark:text-[#f5eee6]" /></label>
                <label className="flex items-center gap-3"><input type="checkbox" checked={Boolean(skill.autoInvoke)} onChange={(event) => updateSkill(index, 'autoInvoke', event.target.checked)} /> Auto-call when task matches</label>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function FeatureSettings({ config, updateConfig }) {
  return <div className="grid grid-cols-2 gap-3">{Object.entries(config.features).filter(([key]) => key !== 'artifacts').map(([key, value]) => <label key={key} className="flex items-center justify-between rounded-lg border border-[#e6dac9] p-4 capitalize dark:border-[#3b342d]"><span>{key.replace(/[A-Z]/g, ' $&')}</span><input type="checkbox" checked={value} onChange={(event) => updateConfig(['features', key], event.target.checked)} /></label>)}</div>;
}

function AppearanceSettings({ config, updateConfig }) {
  return <div className="grid grid-cols-3 gap-4"><Field label="Accent" type="color" value={config.appearance.accent} onChange={(value) => updateConfig(['appearance', 'accent'], value)} /><Field label="Font scale" type="number" value={config.appearance.fontScale} onChange={(value) => updateConfig(['appearance', 'fontScale'], value)} /><label className="grid gap-2 text-sm font-semibold text-[#776d63] dark:text-[#b6a99c]"><span>Theme</span><select value={config.general.theme} onChange={(event) => updateConfig(['general', 'theme'], event.target.value)} className="h-11 rounded-lg border border-[#e6dac9] bg-[#fffaf3] px-3 dark:border-[#3b342d] dark:bg-[#201d1a]"><option>system</option><option>light</option><option>dark</option></select></label></div>;
}

function ConfigSettings({ configPath, onImport, onExport, onChoosePath, onOpenLocation }) {
  return <div className="grid gap-4"><div className="rounded-lg border border-[#e6dac9] bg-[#f1e7d8] p-4 dark:border-[#3b342d] dark:bg-[#201d1a]"><div className="text-sm text-[#776d63] dark:text-[#b6a99c]">Config file</div><div className="break-all font-semibold">{configPath}</div></div><div className="flex flex-wrap gap-2"><button onClick={onImport} className="rounded-lg border px-4 py-2">Import</button><button onClick={onExport} className="rounded-lg border px-4 py-2">Export</button><button onClick={onChoosePath} className="rounded-lg border px-4 py-2">Config path</button><button onClick={onOpenLocation} className="rounded-lg border px-4 py-2">Open location</button></div></div>;
}

function hexToRgb(hex) {
  const normalized = String(hex || '#d97757').replace('#', '');
  return { r: parseInt(normalized.slice(0, 2), 16), g: parseInt(normalized.slice(2, 4), 16), b: parseInt(normalized.slice(4, 6), 16) };
}

function darken(hex) {
  const rgb = hexToRgb(hex);
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => Math.max(0, Math.round(value * 0.82)).toString(16).padStart(2, '0')).join('')}`;
}

createRoot(document.getElementById('app')).render(<App />);
