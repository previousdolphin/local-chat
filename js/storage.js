/**
 * Storage Module
 * IndexedDB wrapper for persistent chat history
 */

class Storage {
  constructor(dbName = 'LocalChatLogs', storeName = 'logs') {
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
    this.isReady = false;
  }

  async init() {
    if (this.isReady && this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        console.error('[Storage] Failed to open database');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isReady = true;
        console.log('[Storage] Database ready');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('sender', 'sender', { unique: false });
        }
      };
    });
  }

  async add(text, sender, isSystem = false) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const entry = {
        text,
        sender,
        isSystem,
        timestamp: Date.now()
      };

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(entry);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(limit = 1000, reverse = true) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      
      const request = index.getAll();
      
      request.onsuccess = () => {
        let logs = request.result;
        if (reverse) logs = logs.reverse();
        if (limit) logs = logs.slice(0, limit);
        resolve(logs);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async getBySession(timeWindow = 3600000) {
    if (!this.db) await this.init();

    const logs = await this.getAll(10000, true);
    const sessions = [];
    let currentSession = null;

    logs.forEach(log => {
      if (!currentSession || Math.abs(log.timestamp - currentSession.timestamp) > timeWindow) {
        if (currentSession) sessions.push(currentSession);
        currentSession = {
          timestamp: log.timestamp,
          logs: []
        };
      }
      currentSession.logs.push(log);
    });

    if (currentSession) sessions.push(currentSession);
    return sessions;
  }

  async clear() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async count() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Create global storage instance
const storage = new Storage();

// Persist user profile
const USER_PROFILE_KEY = 'localchat_profile';

async function saveUserProfile(user) {
  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('[Storage] Failed to save profile:', e);
  }
}

async function loadUserProfile() {
  try {
    const data = localStorage.getItem(USER_PROFILE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('[Storage] Failed to load profile:', e);
    return null;
  }
}
