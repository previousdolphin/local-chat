/**
 * WebRTC Module
 * Handles peer-to-peer connection operations
 */

class WebRTCManager {
  constructor(config = {}) {
    this.rtcConfig = {
      iceServers: config.iceServers || []
    };
    this.localPC = null;
    this.hostPC = null;
    this.channel = null;
    this.isHost = false;
    
    // Callbacks
    this.onMessage = null;
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onIdentityRequest = null;
  }

  // ==================== HOST METHODS ====================

  async createOffer() {
    this.isHost = true;
    this.localPC = new RTCPeerConnection(this.rtcConfig);
    
    this.channel = this.localPC.createDataChannel('chat', {
      ordered: true
    });
    
    this.setupChannelHandlers(this.channel, 'host');
    
    this.localPC.onicecandidate = (event) => {
      if (event.candidate === null) {
        this.emit('localDescriptionReady', this.localPC.localDescription);
      }
    };
    
    const offer = await this.localPC.createOffer();
    await this.localPC.setLocalDescription(offer);
    
    return this.compressDescription(offer);
  }

  async handleAnswer(answerData) {
    if (!this.localPC) throw new Error('No local peer connection');
    
    const answer = this.decompressDescription(answerData);
    await this.localPC.setRemoteDescription(answer);
  }

  // ==================== GUEST METHODS ====================

  async createAnswer(offerData) {
    this.isHost = false;
    
    this.localPC = new RTCPeerConnection(this.rtcConfig);
    
    this.localPC.ondatachannel = (event) => {
      this.channel = event.channel;
      this.setupChannelHandlers(this.channel, 'guest');
      this.emit('connected');
    };
    
    const offer = this.decompressDescription(offerData);
    await this.localPC.setRemoteDescription(offer);
    
    const answer = await this.localPC.createAnswer();
    await this.localPC.setLocalDescription(answer);
    
    this.localPC.onicecandidate = (event) => {
      if (event.candidate === null) {
        this.emit('localDescriptionReady', this.localPC.localDescription);
      }
    };
    
    return this.compressDescription(answer);
  }

  // ==================== SHARED METHODS ====================

  setupChannelHandlers(channel, role) {
    const label = role === 'host' ? 'Host' : 'Guest';
    
    channel.onopen = () => {
      console.log(`[WebRTC] ${label} channel opened`);
      if (this.onConnected) this.onConnected();
      
      // Request identity
      channel.send(JSON.stringify({ type: 'req-identity' }));
    };

    channel.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data));
    };

    channel.onclose = () => {
      console.log(`[WebRTC] ${label} channel closed`);
      if (this.onDisconnected) this.onDisconnected();
    };

    channel.onerror = (error) => {
      console.error(`[WebRTC] ${label} channel error:`, error);
    };
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'identity':
        if (this.onPeerJoin) this.onPeerJoin(msg.user);
        break;
        
      case 'chat':
        if (this.onMessage) this.onMessage(msg);
        break;
        
      case 'system':
        if (this.onMessage) this.onMessage(msg);
        break;
        
      case 'req-identity':
        if (this.onIdentityRequest) this.onIdentityRequest(msg);
        break;
        
      case 'close':
        this.cleanup();
        alert('Host ended the session');
        window.location.reload();
        break;
        
      case 'leave':
        if (this.onPeerLeave) this.onPeerLeave(msg.userId);
        break;
        
      case 'kick':
        this.cleanup();
        alert('You were removed from the group');
        window.location.reload();
        break;
    }
  }

  send(type, payload) {
    if (this.channel && this.channel.readyState === 'open') {
      this.channel.send(JSON.stringify({ type, ...payload }));
      return true;
    }
    return false;
  }

  broadcast(type, payload, excludeId = null) {
    // For host: broadcast to all peers
    // For guest: relay through host
    return this.send(type, payload);
  }

  // ==================== UTILITIES ====================

  compressDescription(desc) {
    // LZString should be loaded globally
    if (typeof LZString !== 'undefined') {
      return LZString.compressToBase64(JSON.stringify(desc));
    }
    return JSON.stringify(desc);
  }

  decompressDescription(data) {
    if (typeof LZString !== 'undefined') {
      return JSON.parse(LZString.decompressFromBase64(data));
    }
    return JSON.parse(data);
  }

  emit(event, data) {
    // Will be connected to store
    if (window.store) {
      store.setState({ lastEvent: { event, data, timestamp: Date.now() } });
    }
  }

  cleanup() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.localPC) {
      this.localPC.close();
      this.localPC = null;
    }
    this.isHost = false;
  }

  destroy() {
    this.cleanup();
    this.onMessage = null;
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onIdentityRequest = null;
  }
}

// Export globally
window.WebRTCManager = WebRTCManager;
