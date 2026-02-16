export function logInfo(event, fields = {}) {
  const entry = {
    level: 'info',
    event,
    timestamp: new Date().toISOString(),
    ...fields
  };
  console.log(JSON.stringify(entry));
}

export function logError(event, fields = {}) {
  const entry = {
    level: 'error',
    event,
    timestamp: new Date().toISOString(),
    ...fields
  };
  console.error(JSON.stringify(entry));
}
