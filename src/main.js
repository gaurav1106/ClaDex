const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const Store = require('electron-store');
const { LocalDatabase } = require('./backend/database');
const keychain = require('./backend/keychain');
const { McpManager } = require('./backend/mcp-manager');

let mainWindow;
let browserPipWindow;
let db;
const mcpManager = new McpManager();

const store = new Store({
  name: 'cladex',
  defaults: {
    configPath: '',
    config: {
      general: {
        displayName: 'ClaDex',
        launchAtLogin: false,
        telemetry: false,
        theme: 'light',
        workspaceRoot: ''
      },
      model: {
        runtimeName: 'OpenClaude',
        provider: 'anthropic-compatible',
        defaultModel: 'claude-3-5-sonnet',
        apiBaseUrl: 'http://localhost:3000/v1',
        apiKey: '',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        maxTokens: 4096,
        temperature: 0.4,
        streaming: true
      },
      designModel: {
        runtimeName: 'OpenDesign',
        provider: 'openai-compatible',
        defaultModel: 'gpt-4.1',
        apiBaseUrl: 'http://localhost:3001/v1',
        apiKey: '',
        apiKeyEnv: 'OPENDESIGN_API_KEY',
        maxTokens: 8192,
        temperature: 0.65,
        streaming: true,
        githubRepo: 'https://github.com/nexu-io/open-design'
      },
      features: {
        computerUse: false,
        webSearch: false,
        codeExecution: true,
        memory: true,
        voice: false
      },
      skills: [
        {
          id: 'coding',
          name: 'Coding',
          enabled: true,
          path: '',
          sourceRepo: 'Gitlawb/openclaude',
          description: 'Code editing, review, and debugging.',
          instructions: 'Use repository context, terminal checks, focused edits, and clear verification.',
          knowledgeBase: 'Project files, README, tests, package scripts, and prior conversation state.',
          slash: '/code',
          autoInvoke: true
        },
        {
          id: 'research',
          name: 'Research',
          enabled: true,
          path: '',
          sourceRepo: 'Gitlawb/openclaude',
          description: 'Source-backed technical research.',
          instructions: 'Browse when facts are current, niche, or source-sensitive; cite primary sources.',
          knowledgeBase: 'Official docs, source repositories, release notes, standards, and local notes.',
          slash: '/research',
          autoInvoke: true
        },
        {
          id: 'browser',
          name: 'Browser',
          enabled: true,
          path: '',
          sourceRepo: 'Gitlawb/openclaude',
          description: 'Open, inspect, test, and screenshot local or public web targets.',
          instructions: 'Use browser automation when the task needs page state, screenshots, or interaction.',
          knowledgeBase: 'DOM snapshots, screenshots, browser console output, and page URLs.',
          slash: '/browser',
          autoInvoke: true
        },
        {
          id: 'open-design-web-prototype',
          name: 'Open Design Web Prototype',
          enabled: true,
          path: '',
          sourceRepo: 'nexu-io/open-design',
          description: 'Turn product prompts into polished web prototypes and design systems.',
          instructions: 'Use layout hierarchy, responsive constraints, interaction states, and production-ready visual decisions.',
          knowledgeBase: 'Open Design skill protocol, design systems, templates, and brand/style references.',
          slash: '/design',
          autoInvoke: true
        }
      ],
      mcpServers: [
        {
          id: 'filesystem',
          name: 'Local Files',
          enabled: true,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
          env: {}
        }
      ],
      permissions: {
        filesystem: 'ask',
        network: 'ask',
        shell: 'ask',
        autoApplyEdits: false,
        allowedCommands: ['npm run check', 'npm run build']
      },
      appearance: {
        accent: '#d97757',
        density: 'comfortable',
        fontScale: 100
      }
    }
  }
});

const DEFAULT_SKILL_REPOS = ['https://github.com/obra/superpowers'];

function normalizeConfig(config) {
  const defaults = {
    model: {
      runtimeName: 'OpenClaude',
      provider: 'anthropic-compatible',
      defaultModel: 'claude-3-5-sonnet',
      apiBaseUrl: 'http://localhost:3000/v1',
      apiKey: '',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      maxTokens: 4096,
      temperature: 0.4,
      streaming: true
    },
    designModel: {
      runtimeName: 'OpenDesign',
      provider: 'openai-compatible',
      defaultModel: 'gpt-4.1',
      apiBaseUrl: 'http://localhost:3001/v1',
      apiKey: '',
      apiKeyEnv: 'OPENDESIGN_API_KEY',
      maxTokens: 8192,
      temperature: 0.65,
      streaming: true,
      githubRepo: 'https://github.com/nexu-io/open-design'
    }
  };
  const normalized = JSON.parse(JSON.stringify(config || {}));
  normalized.model = { ...(defaults.model || {}), ...(normalized.model || {}) };
  normalized.model.runtimeName ||= 'OpenClaude';
  normalized.designModel = {
    ...(defaults.designModel || {}),
    ...(normalized.designModel || {}),
    runtimeName: normalized.designModel?.runtimeName || 'OpenDesign',
    githubRepo: normalized.designModel?.githubRepo || 'https://github.com/nexu-io/open-design'
  };
  if (normalized.designModel.githubRepo === 'https://github.com/manalkaff/opendesign') {
    normalized.designModel.githubRepo = 'https://github.com/nexu-io/open-design';
  }
  if (normalized.features?.artifacts !== undefined) {
    delete normalized.features.artifacts;
  }
  normalized.skills = (normalized.skills || []).map((skill) => ({
    id: skill.id || `skill-${Date.now()}`,
    name: skill.name || 'Untitled skill',
    enabled: skill.enabled !== false,
    path: skill.path || '',
    sourceRepo: skill.sourceRepo || '',
    description: skill.description || '',
    instructions: skill.instructions || '',
    knowledgeBase: skill.knowledgeBase || '',
    slash: skill.slash || `/${String(skill.name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    autoInvoke: skill.autoInvoke !== false
  }));
  return normalized;
}

function slugify(value, fallback = 'skill') {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function parseGithubRepoUrl(input) {
  let parsed;
  try {
    parsed = new URL(String(input || '').trim());
  } catch {
    throw new Error('Enter a valid GitHub repository URL.');
  }

  if (!['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('Only github.com repository URLs are supported.');
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('GitHub URL must include an owner and repository.');

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  let branch = '';
  let subpath = '';
  const treeIndex = parts.indexOf('tree');
  if (treeIndex >= 0 && parts[treeIndex + 1]) {
    branch = parts[treeIndex + 1];
    subpath = parts.slice(treeIndex + 2).join('/');
  }

  return { owner, repo, branch, subpath, repoUrl: `https://github.com/${owner}/${repo}` };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'ClaDex'
    }
  });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'ClaDex' } });
  if (!response.ok) throw new Error(`Could not read ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

function pickSkillFiles(files, subpath = '') {
  const prefix = subpath ? `${subpath.replace(/\/+$/, '')}/` : '';
  const scoped = files
    .filter((file) => file.type === 'blob')
    .map((file) => file.path)
    .filter((filePath) => !prefix || filePath === subpath || filePath.startsWith(prefix));

  const skillFiles = scoped.filter((filePath) => /(^|\/)SKILL\.md$/i.test(filePath));
  if (skillFiles.length) return skillFiles;

  const readmeFiles = scoped.filter((filePath) => /(^|\/)README\.md$/i.test(filePath));
  if (readmeFiles.length) return readmeFiles;

  const instructionFiles = scoped.filter((filePath) => /(^|\/)(prompt|instructions)\.md$/i.test(filePath));
  if (instructionFiles.length) return instructionFiles;

  return scoped.filter((filePath) => /\.md$/i.test(filePath));
}

function parseSkillMarkdown(markdown, fallbackName, sourceRepo, sourceFile) {
  const content = String(markdown || '').trim();
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter = frontmatterMatch?.[1] || '';
  const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length).trim() : content;
  const frontmatterTitle = frontmatter.match(/^name:\s*(.+)$/im)?.[1]?.trim().replace(/^["']|["']$/g, '');
  const frontmatterDescription = frontmatter.match(/^description:\s*(.+)$/im)?.[1]?.trim().replace(/^["']|["']$/g, '');
  const lines = body.split(/\r?\n/);
  const heading = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim();
  const description = frontmatterDescription || lines.find((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('```');
  })?.trim() || `Imported from ${sourceRepo}.`;
  const name = frontmatterTitle || heading || fallbackName;
  return {
    name,
    description: description.slice(0, 240),
    sourceRepo,
    instructions: content,
    knowledgeBase: `Imported from ${sourceRepo}\nSource file: ${sourceFile}`,
    slash: `/${slugify(name)}`,
    autoInvoke: true,
    enabled: true,
    path: ''
  };
}

async function importGithubSkills(repoInput) {
  const repoInfo = parseGithubRepoUrl(repoInput);
  const repoMeta = await fetchJson(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`);
  const branch = repoInfo.branch || repoMeta.default_branch || 'main';
  const tree = await fetchJson(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const sourceFiles = pickSkillFiles(tree.tree || [], repoInfo.subpath);
  if (!sourceFiles.length) throw new Error('No SKILL.md, README.md, or Markdown instruction files were found in that repository.');
  const skills = [];
  for (const sourceFile of sourceFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${encodeURIComponent(branch)}/${sourceFile.split('/').map(encodeURIComponent).join('/')}`;
    const markdown = await fetchText(rawUrl);
    const folderName = sourceFile.split('/').at(-2) || repoInfo.repo;
    const skill = parseSkillMarkdown(markdown, folderName, repoInfo.repoUrl, sourceFile);
    skill.id = `github-${slugify(repoInfo.owner)}-${slugify(repoInfo.repo)}-${slugify(sourceFile.replace(/\/SKILL\.md$/i, '').replace(/\//g, '-'))}`;
    skills.push(skill);
  }
  return skills;
}

async function seedDefaultSkills(config) {
  config.skills ||= [];
  for (const repoUrl of DEFAULT_SKILL_REPOS) {
    try {
      const imported = await importGithubSkills(repoUrl);
      const existingIds = new Set(config.skills.map((skill) => skill.id));
      const existingCalls = new Set(config.skills.map((skill) => `${skill.sourceRepo}:${skill.slash}`));
      for (const skill of imported) {
        if (!existingIds.has(skill.id) && !existingCalls.has(`${skill.sourceRepo}:${skill.slash}`)) {
          config.skills.push(skill);
        }
      }
    } catch (error) {
      console.warn(`Could not seed default skills from ${repoUrl}: ${error.message}`);
    }
  }
  return config;
}

function getConfigPath() {
  const configured = store.get('configPath');
  if (configured) return configured;
  return path.join(app.getPath('userData'), 'cladex-config.json');
}

async function ensureConfigFile() {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(raw);
    store.set('config', config);
  } catch {
    await fs.writeFile(configPath, JSON.stringify(store.get('config'), null, 2));
  }
  return configPath;
}

async function saveConfig(config) {
  const configPath = getConfigPath();
  store.set('config', config);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return { configPath, config };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 700,
    title: 'ClaDex',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#f7f3eb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.CLADEX_DEV_SERVER) {
    mainWindow.loadURL(process.env.CLADEX_DEV_SERVER);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer-dist', 'index.html'));
  }
}

function browserPipHtml(startUrl) {
  const url = JSON.stringify(startUrl || 'https://www.google.com');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { height: 100%; margin: 0; background: #1b1b19; color: #e9e4dc; font-family: Inter, system-ui, sans-serif; overflow: hidden; }
    .bar { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 8px; align-items: center; height: 48px; padding: 8px; box-sizing: border-box; background: #242424; border-bottom: 1px solid #343432; }
    button { height: 32px; border: 1px solid #42423f; border-radius: 8px; background: #30302e; color: #f2eee7; font: inherit; padding: 0 10px; }
    input { height: 32px; min-width: 0; border: 1px solid #42423f; border-radius: 8px; background: #1b1b19; color: #f2eee7; padding: 0 10px; outline: none; }
    webview { width: 100%; height: calc(100% - 48px); background: white; }
  </style>
</head>
<body>
  <div class="bar">
    <button id="back" title="Back">Back</button>
    <input id="url" value="" />
    <button id="go" title="Go">Go</button>
    <button id="close" title="Close">Close</button>
  </div>
  <webview id="view" src="about:blank" allowpopups></webview>
  <script>
    const startUrl = ${url};
    const view = document.getElementById('view');
    const input = document.getElementById('url');
    function normalize(value) {
      if (!value) return 'https://www.google.com';
      if (/^(https?|file):\\/\\//i.test(value)) return value;
      if (/^localhost(:|\\/|$)|^127\\.0\\.0\\.1/i.test(value)) return 'http://' + value;
      return 'https://' + value;
    }
    function load(value) {
      const next = normalize(value);
      input.value = next;
      view.src = next;
    }
    document.getElementById('go').addEventListener('click', () => load(input.value));
    document.getElementById('back').addEventListener('click', () => view.canGoBack() && view.goBack());
    document.getElementById('close').addEventListener('click', () => window.close());
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') load(input.value); });
    view.addEventListener('did-navigate', (event) => { input.value = event.url; });
    view.addEventListener('did-navigate-in-page', (event) => { input.value = event.url; });
    load(startUrl);
  </script>
</body>
</html>`;
}

function openBrowserPip(url) {
  const icon = path.join(__dirname, '..', 'assets', 'icon.ico');
  if (browserPipWindow && !browserPipWindow.isDestroyed()) {
    browserPipWindow.show();
    browserPipWindow.focus();
    if (url) browserPipWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(browserPipHtml(url))}`);
    return true;
  }
  browserPipWindow = new BrowserWindow({
    width: 800,
    height: 600,
    maxWidth: 800,
    maxHeight: 600,
    minWidth: 420,
    minHeight: 320,
    title: 'ClaDex Browser',
    icon,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  browserPipWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(browserPipHtml(url))}`);
  browserPipWindow.on('closed', () => {
    browserPipWindow = null;
    mainWindow?.show();
    mainWindow?.focus();
  });
  return true;
}

app.whenReady().then(async () => {
  app.setAppUserModelId('local.cladex');
  Menu.setApplicationMenu(null);
  await ensureConfigFile();
  db = new LocalDatabase(path.join(app.getPath('userData'), 'cladex.sqlite'));
  await db.init();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  mcpManager.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

mcpManager.on('status', (statuses) => {
  mainWindow?.webContents.send('mcp:status', statuses);
});

ipcMain.handle('config:load', async () => {
  const configPath = await ensureConfigFile();
  const config = await seedDefaultSkills(normalizeConfig(store.get('config')));
  config.model.apiKey = '';
  config.model.hasSecureApiKey = Boolean(await keychain.getSecret('model-api-key'));
  config.model.secureStorageAvailable = keychain.hasSecureStorage();
  config.designModel.apiKey = '';
  config.designModel.hasSecureApiKey = Boolean(await keychain.getSecret('design-model-api-key'));
  config.designModel.secureStorageAvailable = keychain.hasSecureStorage();
  store.set('config', config);
  await saveConfig(config);
  return { configPath, config };
});

ipcMain.handle('config:save', async (_event, config) => {
  config = normalizeConfig(config);
  if (config.model?.apiKey) {
    await keychain.setSecret('model-api-key', config.model.apiKey);
    config.model.hasSecureApiKey = true;
  }
  if (config.designModel?.apiKey) {
    await keychain.setSecret('design-model-api-key', config.designModel.apiKey);
    config.designModel.hasSecureApiKey = true;
  }
  const cleanConfig = JSON.parse(JSON.stringify(config));
  cleanConfig.model.apiKey = '';
  cleanConfig.model.secureStorageAvailable = keychain.hasSecureStorage();
  cleanConfig.designModel.apiKey = '';
  cleanConfig.designModel.secureStorageAvailable = keychain.hasSecureStorage();
  return saveConfig(cleanConfig);
});

ipcMain.handle('config:choosePath', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Choose ClaDex config file',
    defaultPath: getConfigPath(),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  store.set('configPath', filePath);
  return saveConfig(store.get('config'));
});

ipcMain.handle('config:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import ClaDex config',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths[0]) return null;
  const raw = await fs.readFile(filePaths[0], 'utf8');
  const config = JSON.parse(raw);
  return saveConfig(config);
});

ipcMain.handle('config:export', async (_event, config) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export ClaDex config',
    defaultPath: 'cladex-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
  return filePath;
});

ipcMain.handle('config:openLocation', async () => {
  const configPath = getConfigPath();
  await shell.showItemInFolder(configPath);
  return configPath;
});

ipcMain.handle('chat:list', async () => db.listChats());

ipcMain.handle('chat:create', async (_event, title) => db.createChat(title));

ipcMain.handle('chat:get', async (_event, chatId) => db.getChat(chatId));

ipcMain.handle('chat:addMessage', async (_event, { chatId, role, content }) => db.addMessage(chatId, role, content));

ipcMain.handle('chat:updateMessage', async (_event, { messageId, content }) => db.updateMessage(messageId, content));

ipcMain.handle('chat:deleteAfter', async (_event, { chatId, messageId }) => db.deleteMessagesAfter(chatId, messageId));

ipcMain.handle('chat:delete', async (_event, chatId) => db.deleteChat(chatId));

ipcMain.handle('chat:togglePin', async (_event, chatId) => db.toggleChatPin(chatId));

ipcMain.handle('mcp:list', async () => mcpManager.list());

ipcMain.handle('mcp:start', async (_event, server) => {
  mcpManager.start(server);
  return mcpManager.list();
});

ipcMain.handle('mcp:stop', async (_event, id) => {
  mcpManager.stop(id);
  return mcpManager.list();
});

ipcMain.handle('mcp:install', async (_event, server) => {
  const config = store.get('config');
  const exists = config.mcpServers.some((item) => item.id === server.id);
  if (!exists) config.mcpServers.push(server);
  await saveConfig(config);
  return config;
});

ipcMain.handle('skill:importGithub', async (_event, url) => importGithubSkills(url));

ipcMain.handle('project:list', async () => db.listProjects());

ipcMain.handle('project:create', async (_event, { name, description, folderPath, files }) => db.createProject(name, description, folderPath, files));

ipcMain.handle('project:delete', async (_event, projectId) => db.deleteProject(projectId));

ipcMain.handle('project:togglePin', async (_event, projectId) => db.toggleProjectPin(projectId));

ipcMain.handle('project:chooseFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Choose project folder',
    properties: ['openDirectory']
  });
  return canceled ? '' : filePaths[0] || '';
});

ipcMain.handle('project:chooseFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Choose project files',
    properties: ['openFile', 'multiSelections']
  });
  return canceled ? [] : filePaths;
});

ipcMain.handle('project:openPath', async (_event, targetPath) => {
  if (!targetPath) return false;
  if (/^(https?|file):\/\//i.test(String(targetPath))) {
    await shell.openExternal(targetPath);
  } else {
    await shell.openPath(targetPath);
  }
  return true;
});

ipcMain.handle('browser:pip:open', async (_event, url) => openBrowserPip(url));

ipcMain.handle('browser:pip:back', async () => {
  if (browserPipWindow && !browserPipWindow.isDestroyed()) {
    await browserPipWindow.webContents.executeJavaScript("document.getElementById('view')?.canGoBack() && document.getElementById('view').goBack();").catch(() => null);
  }
  return true;
});

ipcMain.handle('browser:pip:close', async () => {
  if (browserPipWindow && !browserPipWindow.isDestroyed()) browserPipWindow.close();
  return true;
});

function resolveUrl(baseUrl, pathName) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith(pathName)) return trimmed;
  return `${trimmed}${pathName}`;
}

function isOpenAiCompatible(config) {
  const provider = String(config.model.provider || '').toLowerCase();
  const baseUrl = String(config.model.apiBaseUrl || '').toLowerCase();
  return provider.includes('openai') || provider.includes('openrouter') || baseUrl.includes('/chat/completions');
}

function runtimeSystemPrompt(config, messages = []) {
  const parts = [];
  if (config.runtimeMode === 'design') {
    parts.push(
      'You are OpenDesign inside ClaDex.',
      'Act as a senior product designer and frontend design partner.',
      'Prioritize visual hierarchy, usable interaction states, responsive layout, accessibility, and concrete implementation details.',
      `OpenDesign reference: ${config.model.githubRepo || 'https://github.com/nexu-io/open-design'}`
    );
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const activeSkills = (config.skills || []).filter((skill) => {
    if (skill.enabled === false) return false;
    if (skill.slash && lastUserMessage.includes(skill.slash)) return true;
    if (!skill.autoInvoke) return false;
    const haystack = `${skill.name} ${skill.description} ${skill.knowledgeBase}`.toLowerCase();
    return lastUserMessage.toLowerCase().split(/\W+/).some((word) => word.length > 4 && haystack.includes(word));
  });

  if (activeSkills.length) {
    parts.push('Use these ClaDex skills when relevant:');
    for (const skill of activeSkills.slice(0, 4)) {
      parts.push([
        `Skill: ${skill.name}`,
        `Call: ${skill.slash || '/'}`,
        `Description: ${skill.description || ''}`,
        `Instructions: ${skill.instructions || ''}`,
        `Knowledge base: ${skill.knowledgeBase || ''}`
      ].join('\n'));
    }
  }

  return parts.join('\n\n');
}

async function getApiKey(config) {
  const directKey = String(config.model.apiKey || '').trim();
  const envName = String(config.model.apiKeyEnv || '').trim();
  if (directKey) return directKey;
  const secureKeyName = config.runtimeMode === 'design' || String(config.model.runtimeName || '').toLowerCase().includes('opendesign')
    ? 'design-model-api-key'
    : 'model-api-key';
  const secureKey = await keychain.getSecret(secureKeyName);
  if (secureKey) return secureKey;
  if (envName && process.env[envName]) return process.env[envName];
  if (/^(sk-|or-|op-|ak-)/i.test(envName)) return envName;
  return '';
}

ipcMain.handle('chat:send', async (_event, payload) => {
  const config = payload.config || store.get('config');
  const messages = payload.messages || [];
  const systemPrompt = runtimeSystemPrompt(config, messages);
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const apiKey = await getApiKey(config);

  if (!config.model.apiBaseUrl) {
    throw new Error('API base URL is empty. Set it in Model settings first.');
  }

  if (isOpenAiCompatible(config)) {
    const response = await fetch(resolveUrl(config.model.apiBaseUrl, '/chat/completions'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...(String(config.model.provider || '').toLowerCase().includes('openrouter') ? { 'http-referer': 'https://local.cladex', 'x-title': 'ClaDex' } : {})
      },
      body: JSON.stringify({
        model: config.model.defaultModel,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...messages.map(({ role, content }) => ({ role, content }))
        ],
        max_tokens: config.model.maxTokens,
        temperature: config.model.temperature,
        stream: false
      })
    });
    if (!response.ok) throw new Error(`OpenAI-compatible request failed at ${resolveUrl(config.model.apiBaseUrl, '/chat/completions')}: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  const response = await fetch(resolveUrl(config.model.apiBaseUrl, '/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(apiKey ? { 'x-api-key': apiKey } : {})
    },
    body: JSON.stringify({
      model: config.model.defaultModel,
      messages: messages.map(({ role, content }) => ({ role, content })),
      ...(systemPrompt ? { system: systemPrompt } : {}),
      max_tokens: config.model.maxTokens,
      temperature: config.model.temperature,
      stream: false
    })
  });
  if (!response.ok) throw new Error(`Anthropic request failed at ${resolveUrl(config.model.apiBaseUrl, '/messages')}: ${await response.text()}`);
  const data = await response.json();
  return data.content?.map((part) => part.text || '').join('\n').trim() || `I received: ${lastUserMessage?.content || ''}`;
});
