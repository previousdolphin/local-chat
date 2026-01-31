/**
 * QR Scanner Module
 * Handles camera access, QR code detection, and manual input
 */

class QRScanner {
  constructor(options = {}) {
    this.video = null;
    this.canvas = null;
    this.stream = null;
    this.isScanning = false;
    this.scanAttempts = 0;
    this.maxScanAttempts = options.maxAttempts || 300;
    this.currentZoom = 1;
    
    // Callbacks
    this.onScan = options.onScan || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
  }

  async start(videoElement, overlayElement) {
    this.video = videoElement;
    this.scanAttempts = 0;
    this.currentZoom = 1;
    this.isScanning = true;
    
    this.updateStatus('Requesting camera access...', false);
    
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      this.video.style.display = 'block';
      
      if (overlayElement) {
        overlayElement.classList.add('active');
      }
      
      await this.video.play();
      
      this.updateStatus('Point camera at QR code...', true);
      this.initZoomCapabilities();
      this.scan();
      
      return true;
    } catch (error) {
      console.error('[QRScanner] Camera error:', error);
      this.updateStatus('Camera access denied', false);
      this.isScanning = false;
      
      if (overlayElement) {
        overlayElement.classList.remove('active');
      }
      
      this.onError(error);
      return false;
    }
  }

  initZoomCapabilities() {
    if (!this.stream) return;
    
    const track = this.stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities?.();
    
    const slider = document.getElementById('zoom-slider');
    const zoomValue = document.getElementById('zoom-value');
    const zoomContainer = document.getElementById('zoom-controls');
    
    if (zoomContainer) {
      zoomContainer.classList.add('show');
    }
    
    if (slider && capabilities?.zoom) {
      slider.min = capabilities.zoom.min || 1;
      slider.max = Math.min(capabilities.zoom.max || 3, 3);
      slider.step = capabilities.zoom.step || 0.1;
      slider.value = 1;
      slider.disabled = false;
      slider.title = 'Use slider or buttons to zoom';
      
      if (zoomValue) zoomValue.textContent = '1.0';
    } else if (slider) {
      slider.disabled = true;
      slider.title = 'Zoom not supported on this device';
    }
  }

  setZoom(value) {
    this.currentZoom = parseFloat(value);
    
    const zoomValue = document.getElementById('zoom-value');
    if (zoomValue) {
      zoomValue.textContent = this.currentZoom.toFixed(1);
    }
    
    this.applyZoom();
  }

  adjustZoom(delta) {
    const slider = document.getElementById('zoom-slider');
    if (!slider || slider.disabled) return;
    
    const min = parseFloat(slider.min) || 1;
    const max = parseFloat(slider.max) || 3;
    let newValue = this.currentZoom + delta;
    newValue = Math.max(min, Math.min(max, newValue));
    
    slider.value = newValue;
    this.setZoom(newValue);
  }

  applyZoom() {
    if (!this.stream) return;
    
    const track = this.stream.getVideoTracks()[0];
    if (!track) return;
    
    const capabilities = track.getCapabilities?.();
    if (!capabilities?.zoom) return;
    
    track.applyConstraints({
      advanced: [{ zoom: this.currentZoom }]
    }).catch(error => {
      console.log('[QRScanner] Zoom not supported:', error.message);
    });
  }

  scan() {
    if (!this.isScanning || !this.video) return;
    
    if (this.scanAttempts > this.maxScanAttempts) {
      this.updateStatus('No QR code found. Try moving closer or use manual entry.', false);
      this.showManualToggle();
      this.isScanning = false;
      return;
    }
    
    this.scanAttempts++;
    
    if (this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
      requestAnimationFrame(() => this.scan());
      return;
    }
    
    // Create canvas for frame capture
    const scale = 0.5;
    const canvas = document.createElement('canvas');
    canvas.width = this.video.videoWidth * scale;
    canvas.height = this.video.videoHeight * scale;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // jsQR should be loaded globally
    if (typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });
      
      if (code) {
        this.stop();
        this.updateStatus('QR code detected! Connecting...', false);
        this.onScan(code.data);
        return;
      }
    }
    
    requestAnimationFrame(() => this.scan());
  }

  async handleManualCode(code) {
    if (!code || !code.trim()) {
      return { success: false, error: 'Please enter a connection code' };
    }
    
    this.updateStatus('Connecting...', true);
    
    try {
      await this.onScan(code.trim());
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || 'Invalid connection code' };
    }
  }

  stop() {
    this.isScanning = false;
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.video) {
      this.video.srcObject = null;
      this.video.style.display = 'none';
    }
    
    const overlay = document.getElementById('qr-scanner-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
    
    const zoomContainer = document.getElementById('zoom-controls');
    if (zoomContainer) {
      zoomContainer.classList.remove('show');
    }
    
    const slider = document.getElementById('zoom-slider');
    if (slider) {
      slider.value = 1;
    }
    
    const zoomValue = document.getElementById('zoom-value');
    if (zoomValue) {
      zoomValue.textContent = '1.0';
    }
  }

  updateStatus(text, showAnim) {
    const statusText = document.getElementById('qr-status-text');
    const statusDot = document.querySelector('.qr-status-anim');
    
    if (statusText) {
      statusText.textContent = text;
    }
    
    if (statusDot) {
      statusDot.style.display = showAnim ? 'inline-block' : 'none';
    }
    
    this.onStatusChange({ text, showAnim });
  }

  showManualToggle() {
    const toggle = document.querySelector('.manual-toggle');
    if (toggle) {
      toggle.style.display = 'inline-block';
    }
  }

  reset() {
    this.stop();
    this.scanAttempts = 0;
    this.currentZoom = 1;
    
    const manualContainer = document.getElementById('manual-input-container');
    if (manualContainer) {
      manualContainer.classList.remove('show');
    }
    
    const manualCode = document.getElementById('manual-code');
    if (manualCode) {
      manualCode.value = '';
    }
  }
}

// Export globally
window.QRScanner = QRScanner;
