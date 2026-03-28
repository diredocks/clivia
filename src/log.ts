export const createLogFn = (prefix: string) => (content: string) =>
  console.log(`[${prefix}@${Date.now()}] ${content}`);
