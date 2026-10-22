let capture: (() => Promise<Blob>) | null = null;
const waiting = new Set<(handler: () => Promise<Blob>) => void>();
export function registerSceneCapture(handler: () => Promise<Blob>) {
  capture = handler;
  for (const ready of waiting) ready(handler);
  return () => {
    if (capture === handler) capture = null;
  };
}
export async function captureScenePng() {
  const handler =
    capture ??
    (await new Promise<() => Promise<Blob>>((resolve, reject) => {
      const ready = (value: () => Promise<Blob>) => {
        clearTimeout(timer);
        waiting.delete(ready);
        resolve(value);
      };
      const timer = setTimeout(() => {
        waiting.delete(ready);
        reject(
          Error(
            'The actual 3D renderer did not become ready within 15 seconds. Open the scene and retry.',
          ),
        );
      }, 15000);
      waiting.add(ready);
    }));
  return handler();
}
