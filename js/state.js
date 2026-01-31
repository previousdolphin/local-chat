/**
 * State Management Module
 * Centralized state with Pub/Sub pattern for reactive updates
 */

class StateManager {
  constructor(initialState = {}) {
    this.state = { ...initialState };
    this.listeners = new Map();
  }

  getState() {
    return { ...this.state };
  }

  setState(updates, event = 'update') {
    const prevState = this.state;
    this.state = { ...this.state, ...updates };
    
    this.emit(event, { prevState, state: this.state });
    
    // Also emit specific events for changed keys
    Object.keys(updates).forEach(key => {
      this.emit(`${key}:change`, { 
        key, 
        value: this.state[key], 
        prevValue: prevState[key] 
      });
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  // Selectors for derived state
  select(path) {
    const keys = path.split('.');
    let value = this.state;
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }
    return value;
  }
}

// Create global state instance
const store = new StateManager({
  // User state
  user: {
    id: null,
    name: '',
    avatar: ''
  },
  
  // Connection state
  isHost: false,
  isConnected: false,
  peers: {},
  serverConn: null,
  
  // UI state
  currentScreen: 'login',
  
  // App state
  isReady: false,
  error: null
});

// Make store globally available
window.store = store;
