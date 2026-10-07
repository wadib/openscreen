/**
 * Export diagnostics that must survive production builds (which drop console calls):
 * encoder choice, Linux frame path and similar decisions. The command-line export forwards
 * them to stdout.
 */
type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function emitExportDiagnostic(message: string): void {
	for (const listener of listeners) listener(message);
}

export function onExportDiagnostic(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
