export const fetchBoard = async () => {
  const response = await fetch('/api/patient-tracking/board');
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el seguimiento');
  return payload;
};

export const updateManualStage = async (phoneNumber, stage) => {
  const response = await fetch(`/api/patient-tracking/${encodeURIComponent(phoneNumber)}/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudo mover la tarjeta');
  return payload;
};

export const restoreAutomaticStage = async (phoneNumber) => {
  const response = await fetch(`/api/patient-tracking/${encodeURIComponent(phoneNumber)}/auto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudo volver a automatico');
  return payload;
};
