export class EdgeAutoScroller {
  constructor(options = {}) {
    this.getElement = options.getElement || (() => null);
    this.getVertical = options.getVertical || (() => false);
    this.onTick = typeof options.onTick === 'function' ? options.onTick : null;
    this.edgeSize = typeof options.edgeSize === 'number' ? options.edgeSize : 64;
    this.maxSpeed = typeof options.maxSpeed === 'number' ? options.maxSpeed : 24;

    this.lastX = 0;
    this.lastY = 0;
    this.rafId = null;
    this.running = false;

    this._tick = this._tick.bind(this);
  }

  update(clientX, clientY) {
    this.lastX = clientX;
    this.lastY = clientY;
    if (!this.running) {
      this.running = true;
      this.rafId = requestAnimationFrame(this._tick);
    }
  }

  _clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  _tick() {
    if (!this.running) return;

    const element = this.getElement();
    if (element) {
      const rect = element.getBoundingClientRect();
      const vertical = this.getVertical();
      let intensity = 0;

      if (vertical) {
        if (this.lastY < rect.top + this.edgeSize) {
          intensity = this._clamp01((rect.top + this.edgeSize - this.lastY) / this.edgeSize);
          element.scrollTop -= this.maxSpeed * intensity;
        } else if (this.lastY > rect.bottom - this.edgeSize) {
          intensity = this._clamp01((this.lastY - (rect.bottom - this.edgeSize)) / this.edgeSize);
          element.scrollTop += this.maxSpeed * intensity;
        }
      } else {
        if (this.lastX < rect.left + this.edgeSize) {
          intensity = this._clamp01((rect.left + this.edgeSize - this.lastX) / this.edgeSize);
          element.scrollLeft -= this.maxSpeed * intensity;
        } else if (this.lastX > rect.right - this.edgeSize) {
          intensity = this._clamp01((this.lastX - (rect.right - this.edgeSize)) / this.edgeSize);
          element.scrollLeft += this.maxSpeed * intensity;
        }
      }

      if (intensity > 0 && this.onTick) {
        this.onTick(this.lastX, this.lastY);
      }
    }

    if (this.running) {
      this.rafId = requestAnimationFrame(this._tick);
    }
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.running = false;
    this.lastX = 0;
    this.lastY = 0;
  }
}
