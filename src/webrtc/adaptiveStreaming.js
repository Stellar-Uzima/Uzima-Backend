const DEFAULTS = {
  TARGET_UPLINK_KBPS: 512, // acceptance: maintain at <= 512 kbps uplink
  CHECK_INTERVAL_MS: 1000,
  SHORT_WINDOW_MS: 3000, // short-term detection window for fallback
  RECOVERY_WINDOW_MS: 5000, // attempt recovery within 5s for track interruptions
  PACKET_LOSS_THRESHOLD: 0.05, // 5% packet loss -> degrade
  JITTER_THRESHOLD_MS: 30,
  RTT_THRESHOLD_MS: 200,
  MIN_FPS: 7,
  MAX_FPS: 30,
  LOW_RES: { width: 320, height: 240 },
  MED_RES: { width: 640, height: 360 },
  HIGH_RES: { width: 1280, height: 720 },
};

export class AdaptivePublisher {
  constructor(pc, localVideoEl, opts = {}) {
    this.pc = pc; // RTCPeerConnection
    this.videoEl = localVideoEl;
    this.opts = { ...DEFAULTS, ...opts };

    this.localStream = null;
    this.currentConstraints = { ...this.opts.HIGH_RES, frameRate: 30 };
    this.encoderParams = null;
    this.statsTimer = null;
    this.lastGoodTime = Date.now();
    this.videoDisabledSince = null;
    this.shortTermBadStart = null;
    this.emaBandwidth = null; // exponential moving average of outgoing bitrate (kbps)
    this.emaAlpha = 0.2;

    this.debugOverlay = this._createOverlay();
  }

  async start() {
    await this._getMedia(this.currentConstraints);
    await this._makeSenders();
    this._startStatsLoop();
  }

  async _getMedia(constraints) {
    const c = {
      audio: true,
      video: {
        width: constraints.width,
        height: constraints.height,
        frameRate: constraints.frameRate || this.opts.MAX_FPS,
      },
    };
    this.localStream = await navigator.mediaDevices.getUserMedia(c);
    this.videoEl.srcObject = this.localStream;
    await this.videoEl.play().catch(() => {});
  }

  async _makeSenders() {
    // attach tracks to peer connection
    for (const track of this.localStream.getTracks()) {
      const sender = this.pc.addTrack(track, this.localStream);
      // Save sender references for setParameters later
      if (track.kind === 'video') this.videoSender = sender;
      if (track.kind === 'audio') this.audioSender = sender;
    }

    // attempt to enable simulcast via setParameters encodings if supported
    try {
      const params = this.videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        // Configure simulcast encodings (3 layers)
        params.encodings = [
          { rid: 'q', maxBitrate: 120_000, scaleResolutionDownBy: 4 }, // low
          { rid: 'h', maxBitrate: 400_000, scaleResolutionDownBy: 2 }, // med
          { rid: 'f', maxBitrate: 1200_000 }, // high
        ];
        await this.videoSender.setParameters(params);
        this.encoderParams = params;
      } else {
        // Already configured by browser or server
        this.encoderParams = params;
      }
    } catch (err) {
      console.warn('Simulcast/SVC setParameters failed or not supported', err);
      // We'll fallback to single-encoding adaptation (change bitrate/resolution)
      this.encoderParams = null;
    }
  }

  _createOverlay() {
    const o = document.createElement('div');
    Object.assign(o.style, {
      position: 'absolute',
      right: '6px',
      top: '6px',
      background: 'rgba(0,0,0,0.6)',
      color: 'white',
      padding: '8px',
      fontSize: '12px',
      zIndex: 9999,
      borderRadius: '6px',
      maxWidth: '320px',
    });
    o.innerHTML = `<div id="ab_stats">initializing...</div>`;
    document.body.appendChild(o);
    return o;
  }

  _updateOverlay(text) {
    const el = this.debugOverlay.querySelector('#ab_stats');
    if (el) el.innerText = text;
  }

  _startStatsLoop() {
    let lastBytesSent = 0;
    let lastTimestamp = 0;

    this.statsTimer = setInterval(async () => {
      const stats = await this.pc.getStats(null);
      let outgoing = null;
      let rtt = 0,
        jitter = 0,
        packetLoss = 0;
      stats.forEach(report => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          if (report.bytesSent != null && report.timestamp != null) {
            if (lastTimestamp) {
              const bytesDelta = report.bytesSent - lastBytesSent;
              const timeDeltaSec = (report.timestamp - lastTimestamp) / 1000;
              const kbps = (bytesDelta * 8) / 1000 / timeDeltaSec;
              outgoing = kbps;
              // EMA
              if (this.emaBandwidth == null) this.emaBandwidth = kbps;
              else
                this.emaBandwidth = this.emaAlpha * kbps + (1 - this.emaAlpha) * this.emaBandwidth;
            }
            lastBytesSent = report.bytesSent;
            lastTimestamp = report.timestamp;
          }
        }
        if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
          // inbound audio stats from remote (optional)
        }
        if (report.type === 'remote-outbound-rtp' && report.kind === 'video') {
          // remote reports jitter, roundTripTime, packetsLost
          if (report.roundTripTime != null) rtt = report.roundTripTime * 1000;
          if (report.jitter != null) jitter = report.jitter * 1000;
          if (report.packetsLost != null && report.packetsSent != null) {
            packetLoss = report.packetsLost / (report.packetsLost + report.packetsSent);
          }
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime != null) rtt = report.currentRoundTripTime * 1000;
        }
      });

      const kbps = outgoing ?? this.emaBandwidth ?? 0;
      this._updateOverlay(`
        uplink: ${kbps.toFixed(1)} kbps
        ema: ${this.emaBandwidth ? this.emaBandwidth.toFixed(1) : '—'} kbps
        rtt: ${Math.round(rtt)} ms
        jitter: ${Math.round(jitter)} ms
        pktLoss: ${(packetLoss * 100).toFixed(2)} %
        resolution: ${this.currentConstraints.width}x${this.currentConstraints.height}
        fps: ${this.currentConstraints.frameRate}
      `);

      // Run adaptation logic
      this._adapt(kbps, rtt, jitter, packetLoss);
    }, this.opts.CHECK_INTERVAL_MS);
  }

  async _adapt(kbps, rtt, jitter, packetLoss) {
    const now = Date.now();
    // ------------- Detect serious degradation (audio-only fallback) ----------------
    const videoBad =
      kbps < this.opts.TARGET_UPLINK_KBPS * 0.6 ||
      packetLoss > this.opts.PACKET_LOSS_THRESHOLD ||
      jitter > this.opts.JITTER_THRESHOLD_MS ||
      rtt > this.opts.RTT_THRESHOLD_MS;

    if (videoBad) {
      if (!this.shortTermBadStart) this.shortTermBadStart = now;
      const badDuration = now - this.shortTermBadStart;
      // If degraded for more than SHORT_WINDOW_MS -> fallback to audio-only
      if (badDuration >= this.opts.SHORT_WINDOW_MS) {
        if (!this.videoDisabledSince) {
          // disable video track
          console.warn('Conditions degraded -> switching to audio-only');
          this.videoSender.track.enabled = false;
          this.videoDisabledSince = now;
          // optionally send a signaling event to remote to switch UI
        }
        return; // we're audio-only now; skip further adaptation
      }
    } else {
      // conditions good: reset shortTerm
      this.shortTermBadStart = null;
    }

    // ------------- If video currently disabled, check for recovery ----------------
    if (this.videoDisabledSince) {
      // attempt to re-enable if kbps and jitter are good for RECOVERY_WINDOW_MS
      if (kbps >= this.opts.TARGET_UPLINK_KBPS && jitter < this.opts.JITTER_THRESHOLD_MS) {
        // re-enable
        console.info('Network improved -> re-enabling video');
        this.videoSender.track.enabled = true;
        this.videoDisabledSince = null;
      }
      return;
    }

    // ------------- Layer selection / encoder parameter adjustments ---------------
    // If simulcast is enabled, prefer changing encodings' maxBitrate; otherwise change resolution/framerate.
    if (this.encoderParams && this.encoderParams.encodings) {
      // Example strategy:
      // - If ewma kbps < 0.6*target -> prefer low encoding only
      // - If between 0.6 and 1.0 -> medium
      // - else -> high
      const e = this.encoderParams.encodings;
      try {
        const params = this.videoSender.getParameters();
        // adjust maxBitrate on encodings
        if (this.emaBandwidth < this.opts.TARGET_UPLINK_KBPS * 0.6) {
          // enable low only
          params.encodings = e.map((enc, i) => {
            if (i === 0) return { ...enc, active: true, maxBitrate: 100_000 };
            return { ...enc, active: false };
          });
          await this.videoSender.setParameters(params);
        } else if (this.emaBandwidth < this.opts.TARGET_UPLINK_KBPS) {
          // medium
          params.encodings = e.map((enc, i) => {
            if (i <= 1) return { ...enc, active: true, maxBitrate: i === 0 ? 120_000 : 400_000 };
            return { ...enc, active: false };
          });
          await this.videoSender.setParameters(params);
        } else {
          // all encodings on
          params.encodings = e.map((enc, i) => ({ ...enc, active: true }));
          await this.videoSender.setParameters(params);
        }
      } catch (err) {
        console.warn('Failed to set simulcast params', err);
      }
    } else {
      // No simulcast: change capture resolution or framerate
      // coarse logic:
      if (this.emaBandwidth < this.opts.TARGET_UPLINK_KBPS * 0.6) {
        await this._setCaptureConstraints(
          this.opts.LOW_RES.width,
          this.opts.LOW_RES.height,
          Math.max(this.opts.MIN_FPS, 10)
        );
      } else if (this.emaBandwidth < this.opts.TARGET_UPLINK_KBPS) {
        await this._setCaptureConstraints(this.opts.MED_RES.width, this.opts.MED_RES.height, 15);
      } else {
        await this._setCaptureConstraints(this.opts.HIGH_RES.width, this.opts.HIGH_RES.height, 30);
      }
    }
  }

  async _setCaptureConstraints(w, h, fps) {
    // Only re-acquire if different
    if (
      this.currentConstraints.width === w &&
      this.currentConstraints.height === h &&
      this.currentConstraints.frameRate === fps
    )
      return;
    this.currentConstraints = { width: w, height: h, frameRate: fps };
    // stop video track, getUserMedia with new constraints, replaceTrack on sender
    const oldTrack = this.videoSender.track;
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { width: w, height: h, frameRate: fps },
    });
    const newTrack = newStream.getVideoTracks()[0];
    await this.videoSender.replaceTrack(newTrack);
    // stop and release old track
    oldTrack.stop();
    // update local stream + element
    this.localStream.removeTrack(oldTrack);
    this.localStream.addTrack(newTrack);
    this.videoEl.srcObject = this.localStream;
  }

  stop() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
  }
}
