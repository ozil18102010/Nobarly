const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
});
