type BarcodeScannerOptions = {
  onScan: (code: string) => void;
  enabled?: boolean;
  minLength?: number;
  maxLength?: number;
  scanTimeoutMs?: number;
  avgCharTimeMs?: number;
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
};

export function installBarcodeScanner(options: BarcodeScannerOptions) {
  const {
    onScan,
    enabled = true,
    minLength = 6,
    maxLength = 128,
    scanTimeoutMs = 120,
    avgCharTimeMs = 50,
  } = options;

  if (!enabled) {
    return () => {};
  }

  let buffer = '';
  let startTime = 0;
  let lastTime = 0;
  let timer: number | null = null;

  const reset = () => {
    buffer = '';
    startTime = 0;
    lastTime = 0;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const finalize = () => {
    const length = buffer.length;
    if (length < minLength || length > maxLength) {
      reset();
      return;
    }
    const duration = lastTime - startTime;
    const avg = length > 1 ? duration / (length - 1) : duration;
    if (avg <= avgCharTimeMs) {
      onScan(buffer);
    }
    reset();
  };

  const scheduleFinalize = () => {
    if (timer) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(finalize, scanTimeoutMs);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!enabled) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const key = event.key;
    if (key === 'Enter' || key === 'Tab') {
      if (buffer.length >= minLength) {
        finalize();
      } else {
        reset();
      }
      return;
    }
    if (key.length !== 1) {
      return;
    }
    const now = Date.now();
    if (!startTime || now - lastTime > scanTimeoutMs) {
      buffer = '';
      startTime = now;
    }
    buffer += key;
    lastTime = now;
    if (!isEditableTarget(event.target)) {
      scheduleFinalize();
    } else {
      scheduleFinalize();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    reset();
  };
}
