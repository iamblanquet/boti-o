(function () {
  const MAX_FILE_SIZE_BYTES = 16 * 1024 * 1024;

  const RECORDER_FORMATS = [
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
    { mimeType: 'audio/ogg', extension: 'ogg' },
    { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
    { mimeType: 'audio/mp4', extension: 'm4a' },
    { mimeType: 'audio/aac', extension: 'aac' },
    { mimeType: 'audio/mpeg', extension: 'mp3' },
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' }
  ];

  const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const isAudioFile = (file) => {
    const mimeType = file.type || '';
    const extension = (file.name || '').split('.').pop()?.toLowerCase();
    return mimeType.startsWith('audio/')
      || ['aac', 'amr', 'm4a', 'mp3', 'ogg', 'opus', 'wav', 'webm'].includes(extension);
  };

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });

  const createAttachmentFromFile = async (file) => {
    if (!file) return null;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('El archivo supera el limite de 16 MB.');
    }

    return {
      name: file.name || 'audio',
      size: file.size,
      dataUrl: await fileToDataUrl(file),
      mimeType: file.type || '',
      kind: isAudioFile(file) ? 'audio' : 'file'
    };
  };

  const getSupportedRecorderFormat = () => {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return null;
    return RECORDER_FORMATS.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) || null;
  };

  const createAudioRecorder = ({ onAttachmentReady, onRecordingChange, onError }) => {
    let mediaRecorder = null;
    let stream = null;
    let chunks = [];
    let currentFormat = null;
    let startedAt = 0;
    let timerId = null;
    let cancelled = false;

    const emitRecordingChange = (isRecording) => {
      onRecordingChange?.({
        isRecording,
        elapsedMs: isRecording ? Date.now() - startedAt : 0
      });
    };

    const clearTimer = () => {
      if (timerId) window.clearInterval(timerId);
      timerId = null;
    };

    const cleanup = () => {
      clearTimer();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      stream = null;
      mediaRecorder = null;
      chunks = [];
      currentFormat = null;
      startedAt = 0;
      cancelled = false;
      emitRecordingChange(false);
    };

    const start = async () => {
      if (mediaRecorder?.state === 'recording') return;
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        onError?.('Tu navegador no permite grabar audio desde esta pantalla.');
        return;
      }

      const supportedFormat = getSupportedRecorderFormat();
      if (!supportedFormat) {
        onError?.('Tu navegador no puede grabar un formato de audio compatible con WhatsApp. Puedes adjuntar un audio desde el clip.');
        return;
      }

      try {
        currentFormat = supportedFormat;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: supportedFormat.mimeType });
        chunks = [];
        cancelled = false;

        mediaRecorder.addEventListener('dataavailable', (event) => {
          if (event.data?.size > 0) chunks.push(event.data);
        });

        mediaRecorder.addEventListener('stop', async () => {
          if (cancelled) {
            cleanup();
            return;
          }

          try {
            const blob = new Blob(chunks, { type: currentFormat.mimeType });
            const file = new File(
              [blob],
              `audio-dashboard-${Date.now()}.${currentFormat.extension}`,
              { type: currentFormat.mimeType }
            );
            const attachment = await createAttachmentFromFile(file);
            onAttachmentReady?.({
              ...attachment,
              kind: 'audio',
              recorded: true
            });
          } catch (error) {
            onError?.(error.message || 'No se pudo preparar el audio grabado.');
          } finally {
            cleanup();
          }
        });

        startedAt = Date.now();
        mediaRecorder.start();
        emitRecordingChange(true);
        timerId = window.setInterval(() => emitRecordingChange(true), 1000);
      } catch (error) {
        cleanup();
        onError?.('No se pudo activar el microfono. Revisa los permisos del navegador.');
      }
    };

    const stop = () => {
      if (mediaRecorder?.state === 'recording') {
        mediaRecorder.stop();
      }
    };

    const cancel = () => {
      if (mediaRecorder?.state === 'recording') {
        cancelled = true;
        mediaRecorder.stop();
        return;
      }
      cleanup();
    };

    return {
      start,
      stop,
      cancel,
      toggle: () => {
        if (mediaRecorder?.state === 'recording') stop();
        else start();
      },
      isRecording: () => mediaRecorder?.state === 'recording'
    };
  };

  window.DashboardAudioAttachments = {
    MAX_FILE_SIZE_BYTES,
    createAttachmentFromFile,
    createAudioRecorder,
    formatFileSize
  };
}());
