// The only thing the web app learns from the desktop shell: that it's running inside it,
// so it can label the toggle "System audio" instead of "Tab audio".
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('minutesDesktop', { isDesktop: true, platform: process.platform });
