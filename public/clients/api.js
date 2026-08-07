export const fetchClientInsights = async () => {
  const response = await fetch('/api/clients/insights');
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los clientes');
  return payload;
};

export const updateClientResponsible = async (phoneNumber, responsible) => {
  const response = await fetch(`/api/clients/${encodeURIComponent(phoneNumber)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responsible })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudo actualizar el empleado asignado');
  return payload.client;
};

export const updateClientData = async (phoneNumber, data) => {
  const response = await fetch(`/api/clients/${encodeURIComponent(phoneNumber)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'No se pudieron actualizar los datos del cliente');
  return payload.client;
};
