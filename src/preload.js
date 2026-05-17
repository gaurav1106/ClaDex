const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openClaude', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  chooseConfigPath: () => ipcRenderer.invoke('config:choosePath'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  exportConfig: (config) => ipcRenderer.invoke('config:export', config),
  openConfigLocation: () => ipcRenderer.invoke('config:openLocation'),
  sendMessage: (payload) => ipcRenderer.invoke('chat:send', payload),
  listChats: () => ipcRenderer.invoke('chat:list'),
  createChat: (title) => ipcRenderer.invoke('chat:create', title),
  getChat: (chatId) => ipcRenderer.invoke('chat:get', chatId),
  addMessage: (message) => ipcRenderer.invoke('chat:addMessage', message),
  updateMessage: (message) => ipcRenderer.invoke('chat:updateMessage', message),
  deleteMessagesAfter: (payload) => ipcRenderer.invoke('chat:deleteAfter', payload),
  deleteChat: (chatId) => ipcRenderer.invoke('chat:delete', chatId),
  toggleChatPin: (chatId) => ipcRenderer.invoke('chat:togglePin', chatId),
  listMcp: () => ipcRenderer.invoke('mcp:list'),
  startMcp: (server) => ipcRenderer.invoke('mcp:start', server),
  stopMcp: (id) => ipcRenderer.invoke('mcp:stop', id),
  installMcp: (server) => ipcRenderer.invoke('mcp:install', server),
  importGithubSkill: (url) => ipcRenderer.invoke('skill:importGithub', url),
  openBrowserPip: (url) => ipcRenderer.invoke('browser:pip:open', url),
  backBrowserPip: () => ipcRenderer.invoke('browser:pip:back'),
  closeBrowserPip: () => ipcRenderer.invoke('browser:pip:close'),
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (project) => ipcRenderer.invoke('project:create', project),
  deleteProject: (projectId) => ipcRenderer.invoke('project:delete', projectId),
  toggleProjectPin: (projectId) => ipcRenderer.invoke('project:togglePin', projectId),
  chooseProjectFolder: () => ipcRenderer.invoke('project:chooseFolder'),
  chooseProjectFiles: () => ipcRenderer.invoke('project:chooseFiles'),
  openPath: (targetPath) => ipcRenderer.invoke('project:openPath', targetPath),
  onMcpStatus: (callback) => {
    const listener = (_event, statuses) => callback(statuses);
    ipcRenderer.on('mcp:status', listener);
    return () => ipcRenderer.removeListener('mcp:status', listener);
  }
});
