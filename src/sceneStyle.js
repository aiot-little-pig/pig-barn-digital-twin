// Presentation only: never used by the NH3 or control model.
export const SCENE_STYLE = {
  background: '#071321',
  gridMajor: '#24495b',
  gridMinor: '#142c3e',
  ambient: 0.65,
  hemisphere: 0.85,
  keyLight: 2.1,
  rimLight: 1.6,
  fanColor: '#55dbff',
  scrubberColor: '#66f1b9',
  emissiveIntensity: 1.8,
  haloOpacity: 0.12,
};

export function deviceVisualState(frame) {
  return {
    fanActive: typeof frame?.rpm === 'number' && Number.isFinite(frame.rpm) && frame.rpm > 0,
    scrubberActive: frame?.scrubberOn === true,
  };
}
